import logging
import os
import sys
import textwrap
from typing import Dict, List, Optional, Any

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Import the MCPClient
from ..mcp_client.client import MCPClient

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global client instance and lock
mcp_client = None
server_script_path = None
TOOLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tools")


# Models for API requests and responses
class ToolListResponse(BaseModel):
    available_tools: List[str]
    enabled_tools: List[str]


class ToolFilterRequest(BaseModel):
    tool_names: List[str]


class QueryRequest(BaseModel):
    query: str
    tool_names: Optional[List[str]] = None


class QueryResponse(BaseModel):
    response: str


class ToolFileInfo(BaseModel):
    """Information about a tool file"""

    filename: str
    content: str
    description: Optional[str] = None


class ToolFileResponse(BaseModel):
    """Response for tool file operations"""

    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class RegisterNodesRequest(BaseModel):
    """Request to register nodes as tools"""

    workflow_id: str


# Create router
router = APIRouter(tags=["mcp"])


# Dependency to ensure client is initialized
async def get_mcp_client():
    if mcp_client is None:
        raise HTTPException(status_code=503, detail="MCP client not initialized")
    return mcp_client


# Initialize MCP client
async def initialize_mcp_client():
    global mcp_client, server_script_path

    # Default to the weather server
    # TODO: Once server is written, update this path
    server_script_path = "pyspur/tools/server.py"

    mcp_client = MCPClient()
    try:
        await mcp_client.connect_to_server(server_script_path)
        logger.info(f"Connected to MCP server: {server_script_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize MCP client: {str(e)}")
        return False


# Cleanup MCP client
async def cleanup_mcp_client():
    global mcp_client
    if mcp_client:
        await mcp_client.cleanup()
        logger.info("MCP client cleaned up")


# API Routes
@router.get("/", response_model=Dict[str, str])
async def root() -> Dict[str, str]:
    """Root endpoint with basic information."""
    return {
        "status": "online" if mcp_client else "offline",
        "server": server_script_path if mcp_client else "N/A",
        "message": "MCP API is running" if mcp_client else "MCP API is not initialized",
    }


@router.get("/tools", response_model=ToolListResponse)
async def list_tools() -> ToolListResponse:
    """List all available and currently enabled tools."""
    client = await get_mcp_client()
    return ToolListResponse(
        available_tools=client.get_available_tool_names(),
        enabled_tools=client.get_enabled_tool_names(),
    )


@router.get("/tools/available", response_model=List[str])
async def get_available_tools() -> List[str]:
    """Get a list of all available tools for use in the MCP tool node."""
    client = await get_mcp_client()
    return client.get_available_tool_names()


@router.post("/tools/enable", response_model=List[str])
async def enable_tools(request: ToolFilterRequest) -> List[str]:
    """Enable specific tools by name."""
    client = await get_mcp_client()
    enabled_tools = client.filter_tools(request.tool_names)
    return enabled_tools


@router.post("/tools/enable-all", response_model=List[str])
async def enable_all_tools() -> List[str]:
    """Enable all available tools."""
    client = await get_mcp_client()
    enabled_tools = client.filter_tools()
    return enabled_tools


@router.post("/query", response_model=QueryResponse)
async def process_query(request: QueryRequest) -> QueryResponse:
    """Process a query using Claude and the enabled tools."""
    client = await get_mcp_client()

    # Optionally filter tools for this specific query
    if request.tool_names is not None:
        client.filter_tools(request.tool_names)

    # Process the query
    response = await client.process_query(request.query)
    return QueryResponse(response=response)


def get_full_tool_path(filename: str) -> str:
    """
    Get the full path for a tool file, ensuring it's within the tools directory.

    Args:
        filename: The name of the Python file (e.g., 'my_tool.py')

    Returns:
        The full path to the tool file
    """
    # Ensure we only have the filename without any path components
    clean_filename = os.path.basename(filename)
    if not clean_filename.endswith(".py"):
        clean_filename += ".py"
    return os.path.join(TOOLS_DIR, clean_filename)


@router.get("/tools/files", response_model=List[str])
async def list_tool_files() -> List[str]:
    """List all available tool files in the tools directory."""
    try:
        files = [
            f[:-3] if f.endswith(".py") else f  # Remove .py extension
            for f in os.listdir(TOOLS_DIR)
            if f.endswith(".py") and f not in ["__init__.py", "server.py"]
        ]
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tool files: {str(e)}")


@router.get("/tools/files/{filename}", response_model=ToolFileResponse)
async def get_tool_file(filename: str) -> ToolFileResponse:
    """Get the contents of a specific tool file."""
    file_path = get_full_tool_path(filename)

    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Tool file {filename} not found")

        with open(file_path, "r") as f:
            content = f.read()

        return ToolFileResponse(
            success=True,
            message=f"Successfully retrieved {filename}",
            data={"filename": filename, "content": content},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read tool file: {str(e)}")


@router.post("/tools/files", response_model=ToolFileResponse)
async def create_tool_file(tool_file: ToolFileInfo) -> ToolFileResponse:
    """Create a new tool file."""
    file_path = get_full_tool_path(tool_file.filename)
    print(f"Creating tool file at: {file_path}")

    if os.path.exists(file_path):
        raise HTTPException(
            status_code=409, detail=f"Tool file {tool_file.filename} already exists"
        )

    try:
        # Write the file first
        with open(file_path, "w") as f:
            f.write(tool_file.content)

        try:
            return ToolFileResponse(
                success=True,
                message=f"Successfully created {tool_file.filename}",
                data={"filename": tool_file.filename},
            )
        except Exception as reload_error:
            # If reload fails, clean up the file and re-raise
            os.remove(file_path)
            raise HTTPException(
                status_code=500,
                detail=f"Tool file created but failed to reload tools: {str(reload_error)}",
            )
    except Exception as e:
        # Clean up if file was created but other operations failed
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to create tool file: {str(e)}")


@router.put("/tools/files/{filename}", response_model=ToolFileResponse)
async def update_tool_file(filename: str, tool_file: ToolFileInfo) -> ToolFileResponse:
    """Update an existing tool file."""
    file_path = get_full_tool_path(filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Tool file {filename} not found")

    backup_path = f"{file_path}.bak"
    try:
        # Create backup
        os.rename(file_path, backup_path)

        # Write new content
        with open(file_path, "w") as f:
            f.write(tool_file.content)

        try:
            # Remove backup if everything succeeded
            os.remove(backup_path)
            return ToolFileResponse(
                success=True,
                message=f"Successfully updated {filename}",
                data={"filename": filename},
            )
        except Exception as reload_error:
            # If reload fails, restore from backup and re-raise
            if os.path.exists(file_path):
                os.remove(file_path)
            os.rename(backup_path, file_path)
            raise HTTPException(
                status_code=500,
                detail=f"Tool file updated but failed to reload tools: {str(reload_error)}",
            )
    except Exception as e:
        # Restore from backup if it exists
        if os.path.exists(backup_path):
            if os.path.exists(file_path):
                os.remove(file_path)
            os.rename(backup_path, file_path)
        raise HTTPException(status_code=500, detail=f"Failed to update tool file: {str(e)}")


@router.delete("/tools/files/{filename}", response_model=ToolFileResponse)
async def delete_tool_file(filename: str) -> ToolFileResponse:
    """Delete a tool file."""
    file_path = get_full_tool_path(filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Tool file {filename} not found")

    backup_path = f"{file_path}.bak"
    try:
        # Create backup before deletion
        os.rename(file_path, backup_path)

        try:
            # If reload successful, remove the backup
            os.remove(backup_path)
            return ToolFileResponse(success=True, message=f"Successfully deleted {filename}")
        except Exception as reload_error:
            # If reload fails, restore from backup and re-raise
            os.rename(backup_path, file_path)
            raise HTTPException(
                status_code=500,
                detail=f"Tool file deleted but failed to reload tools: {str(reload_error)}",
            )
    except Exception as e:
        # Restore from backup if it exists
        if os.path.exists(backup_path):
            if os.path.exists(file_path):
                os.remove(file_path)
            os.rename(backup_path, file_path)
        raise HTTPException(status_code=500, detail=f"Failed to delete tool file: {str(e)}")


@router.post("/tools/register", response_model=ToolFileResponse)
async def register_nodes_as_tools(request: RegisterNodesRequest) -> ToolFileResponse:
    """
    Register nodes as tools by creating tool files for nodes connected to ToolCallNodes.
    This endpoint should be called before running a workflow to ensure all necessary tools are registered.
    """
    from ..models.workflow_model import WorkflowModel
    from ..database import get_db

    created_files = []

    try:
        # Get the workflow from the database
        db = next(get_db())
        workflow_model = (
            db.query(WorkflowModel).filter(WorkflowModel.id == request.workflow_id).first()
        )

        if not workflow_model:
            raise HTTPException(
                status_code=404, detail=f"Workflow with ID {request.workflow_id} not found"
            )

        # Convert to WorkflowDefinitionSchema
        from ..schemas.workflow_schemas import WorkflowDefinitionSchema

        workflow = WorkflowDefinitionSchema.model_validate(workflow_model.definition)

        # Find all tool call nodes
        tool_call_nodes = [node for node in workflow.nodes if node.node_type == "ToolCallNode"]

        if not tool_call_nodes:
            return ToolFileResponse(
                success=True,
                message="No ToolCallNodes found in the workflow, no tools registered",
                data={"created_files": []},
            )

        # Build a node dictionary for easy lookup
        node_dict = {node.id: node for node in workflow.nodes}

        # For each tool call node, find the source nodes
        for tool_call_node in tool_call_nodes:
            source_nodes = []
            for link in workflow.links:
                if link.target_id == tool_call_node.id:
                    source_node = node_dict.get(link.source_id)
                    if source_node:
                        source_nodes.append(source_node)

            # Convert source nodes to tools and register them
            for source_node in source_nodes:
                filename = source_node.id + ".py"
                tool_content = textwrap.dedent(
                    f"""
                    from typing import Any, Dict
                    from registry import ToolRegistry
                    from pyspur.nodes.factory import NodeFactory
                    from dotenv import load_dotenv
                    load_dotenv()

                    @ToolRegistry.register(description="Auto-generated tool for node_id={source_node.id}, node_type={source_node.node_type}")
                    async def {source_node.id}(input_data: Dict[str, Any]) -> str:

                        node_instance = NodeFactory.create_node(
                            node_name="{source_node.node_type}",
                            node_type_name="{source_node.node_type}",
                            config={source_node.config}
                        )
                        return await node_instance(input_data)
                    """
                )

                tool_info = ToolFileInfo(
                    filename=filename,
                    content=tool_content,
                    description=f"Auto-generated tool for node {source_node.id}",
                )

                # Create the tool file
                file_path = get_full_tool_path(tool_info.filename)

                # Check if file already exists - if so, skip it
                if os.path.exists(file_path):
                    continue

                # Write the file
                with open(file_path, "w") as f:
                    f.write(tool_info.content)

                created_files.append(tool_info.filename)

        return ToolFileResponse(
            success=True,
            message=f"Successfully registered {len(created_files)} tools for workflow {request.workflow_id}",
            data={"created_files": created_files, "workflow_id": request.workflow_id},
        )
    except Exception as e:
        # Clean up any created files if there was an error
        for filename in created_files:
            file_path = get_full_tool_path(filename)
            if os.path.exists(file_path):
                os.remove(file_path)

        raise HTTPException(status_code=500, detail=f"Failed to register nodes as tools: {str(e)}")

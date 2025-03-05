import logging
from typing import Dict, List, Optional

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

# Global client instance
mcp_client = None
server_script_path = None


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
    server_script_path = "pyspur/mcp_client/weather/weather.py"

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
async def root():
    """Root endpoint with basic information."""
    return {
        "status": "online" if mcp_client else "offline",
        "server": server_script_path,
        "message": "MCP API is running" if mcp_client else "MCP API is not initialized",
    }


@router.get("/tools", response_model=ToolListResponse)
async def list_tools():
    """List all available and currently enabled tools."""
    client = await get_mcp_client()
    return {
        "available_tools": client.get_available_tool_names(),
        "enabled_tools": client.get_enabled_tool_names(),
    }


@router.get("/tools/available", response_model=List[str])
async def get_available_tools():
    """Get a list of all available tools for use in the MCP tool node."""
    client = await get_mcp_client()
    return client.get_available_tool_names()


@router.post("/tools/enable", response_model=List[str])
async def enable_tools(request: ToolFilterRequest):
    """Enable specific tools by name."""
    client = await get_mcp_client()
    enabled_tools = client.filter_tools(request.tool_names)
    return enabled_tools


@router.post("/tools/enable-all", response_model=List[str])
async def enable_all_tools():
    """Enable all available tools."""
    client = await get_mcp_client()
    enabled_tools = client.filter_tools()
    return enabled_tools


@router.post("/query", response_model=QueryResponse)
async def process_query(request: QueryRequest):
    """Process a query using Claude and the enabled tools."""
    client = await get_mcp_client()

    # Optionally filter tools for this specific query
    if request.tool_names is not None:
        client.filter_tools(request.tool_names)

    # Process the query
    response = await client.process_query(request.query)
    return {"response": response}

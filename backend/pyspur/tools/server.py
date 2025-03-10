# main.py
import logging
import os
from mcp.server.fastmcp import FastMCP
from registry import ToolRegistry

# Configure logging
logging.basicConfig(level=logging.INFO)

mcp = FastMCP("weather")

# Discover and load all tool modules
current_dir = os.path.dirname(os.path.abspath(__file__))
ToolRegistry.discover_and_load_tools(current_dir)

# Register all tools with MCP
for tool_name, tool_info in ToolRegistry.get_all_tools().items():
    try:
        # Get the module
        module = __import__(tool_info["module"], fromlist=[tool_name])
        # Get the actual function from the module
        func = getattr(module, tool_name)
        # Register with MCP
        mcp.tool()(func)
        logging.info(f"Successfully registered tool {tool_name}")
    except Exception as e:
        logging.error(f"Failed to register tool {tool_name}: {e}")

if __name__ == "__main__":
    mcp.run(transport="stdio")

# Model Control Protocol (MCP) Integration for PySpur

This directory contains the integration of the Model Control Protocol (MCP) into PySpur. MCP allows Claude to use tools provided by external servers through a standardized protocol.

## Components

- `client.py`: The MCP client implementation that connects to MCP servers
- `api.py`: The original standalone API implementation (for reference)
- `weather/`: Example server implementation providing weather-related tools

## Integration with PySpur

The MCP functionality is integrated into PySpur through:

1. `backend/pyspur/api/mcp_management.py`: Contains the FastAPI router for MCP endpoints
2. `backend/pyspur/api/api_app.py`: Includes the MCP router in the API application
3. `backend/pyspur/api/main.py`: Initializes and cleans up the MCP client during application lifespan

## API Endpoints

The MCP API is available under the `/api/mcp` prefix and provides the following endpoints:

- `GET /api/mcp/`: Basic information about the MCP service
- `GET /api/mcp/tools`: List all available and currently enabled tools
- `POST /api/mcp/tools/enable`: Enable specific tools by name
- `POST /api/mcp/tools/enable-all`: Enable all available tools
- `POST /api/mcp/query`: Process a query using Claude and the enabled tools
- `POST /api/mcp/connect/{server_type}`: Connect to a different MCP server

## Configuration

The MCP server script path can be configured using the `MCP_SERVER_SCRIPT` environment variable. By default, it uses the weather server at `weather/weather.py`.

## Usage

To use the MCP functionality:

1. Ensure the MCP server is running (it's initialized automatically when the PySpur application starts)
2. Send queries to the `/api/mcp/query` endpoint with the query text
3. Optionally specify which tools to enable for the query

Example query:

```json
{
  "query": "What's the weather like in San Francisco?",
  "tool_names": ["get_current_weather", "get_weather_forecast"]
}
```

## Adding New MCP Servers

To add a new MCP server:

1. Create a new directory under `backend/mcp/` for your server
2. Implement the server following the MCP specification
3. Update the `connect_to_server` endpoint in `mcp_management.py` to include your new server type 
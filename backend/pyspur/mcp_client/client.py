"""MCP (Model Completion Protocol) Client Implementation.

This client connects to MCP servers and enables Claude to use tools provided by those servers.
The implementation follows the MCP specification for client-server communication, allowing
Claude to make tool calls to external services through a standardized protocol.

This repository contains:
1. A client implementation (this file) that connects to MCP servers
2. Example server implementations in the 'weather' directory that provide weather-related tools

The client supports:
- Connecting to Python or JavaScript MCP servers
- Interactive chat with Claude using available tools
- Filtering which tools are enabled for Claude to use
- Multi-turn conversations with dependent tool calls

Usage:
    python client.py <path_to_server_script>
Example:
    python client.py ../weather/weather.py

For more information on MCP, see: https://github.com/anthropics/anthropic-tools
"""

import asyncio
import json
import logging
import sys
from contextlib import AsyncExitStack
from typing import Any, Dict, List, Optional, Tuple, cast

from anthropic import Anthropic
from anthropic.types import MessageParam
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters, Tool
from mcp.client.stdio import stdio_client

load_dotenv()  # load environment variables from .env

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class MCPClient:
    def __init__(self):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.anthropic = Anthropic()
        self.all_tools: List[Tool] = []  # Store all available tools
        self.enabled_tools: List[Tool] = []  # Store currently enabled tools

    async def connect_to_server(self, server_script_path: str):
        """Connect to an MCP server.

        Args:
            server_script_path: Path to the server script (.py or .js)

        """
        is_python = server_script_path.endswith(".py")
        is_js = server_script_path.endswith(".js")
        if not (is_python or is_js):
            raise ValueError("Server script must be a .py or .js file")

        command = "python" if is_python else "node"
        server_params = StdioServerParameters(command=command, args=[server_script_path], env=None)

        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        self.stdio, self.write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(
            ClientSession(self.stdio, self.write)
        )

        await self.session.initialize()  # type: ignore

        # List available tools
        response = await self.session.list_tools()  # type: ignore
        self.all_tools = response.tools  # type: ignore
        # By default, enable all tools
        self.enabled_tools = self.all_tools  # type: ignore

        # Convert to list of strings for printing
        tool_names = [str(tool.name) for tool in self.all_tools]  # type: ignore
        print("\nConnected to server with tools:", tool_names)

    def filter_tools(self, tool_names: Optional[List[str]] = None) -> List[str]:
        """Filter tools based on provided tool names.

        Args:
            tool_names: List of tool names to enable. If None, all tools are enabled.

        Returns:
            List of enabled tool names

        """
        if tool_names is None or len(tool_names) == 0:
            # Enable all tools
            self.enabled_tools = self.all_tools
        else:
            # Filter tools by name
            self.enabled_tools = [
                tool
                for tool in self.all_tools
                if tool.name in tool_names  # type: ignore
            ]

        return [tool.name for tool in self.enabled_tools]  # type: ignore

    def get_available_tool_names(self) -> List[str]:
        """Get names of all available tools."""
        return [tool.name for tool in self.all_tools]  # type: ignore

    def get_enabled_tool_names(self) -> List[str]:
        """Get names of currently enabled tools."""
        return [tool.name for tool in self.enabled_tools]  # type: ignore

    def _prepare_available_tools(self) -> List[Dict[str, Any]]:
        """Prepare the list of available tools for Claude API."""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            }
            for tool in self.enabled_tools
        ]

    async def _get_claude_response(
        self,
        messages: List[MessageParam],
        conversation_turn: int,
        available_tools: List[Dict[str, Any]],
        max_tokens: int = 1638,
        temperature: float = 0.5,
        output_json_schema: Optional[str] = None,
        json_mode: bool = False,
    ) -> Any:
        """Get a response from Claude API."""
        try:
            # For debugging, we'll log a simplified version of the messages
            debug_messages: List[str] = []
            for msg in messages:
                content = msg["content"]
                if isinstance(content, list):
                    content_types = [
                        (item.get("type", "unknown") if isinstance(item, dict) else "unknown")
                        for item in content
                    ]
                    debug_messages.append(f"{msg['role']}: {content_types}")
                else:
                    debug_messages.append(f"{msg['role']}: text")

            logger.info(f"Sending messages to Claude: {debug_messages}")
            logger.info(f"Available tools: {available_tools}")

            response = self.anthropic.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=max_tokens,
                messages=messages,
                tools=available_tools,  # type: ignore
            )
            logger.info("Received response from Claude")
            return response
        except Exception as e:
            logger.error(f"Error calling Claude API: {str(e)}")
            # For debugging, dump the full messages
            # with open(f"debug_messages_turn_{conversation_turn}.json", "w") as f:
            #     json.dump(messages, f, indent=2)
            raise

    async def _process_tool_use(
        self, content: Any, all_outputs: List[str], tool_results: Dict[str, Any]
    ) -> str:
        """Process a tool use content block and return the tool ID."""
        tool_name = content.name
        tool_args = content.input
        tool_id = content.id

        # Log the tool call
        logger.info(f"Tool use: name={tool_name}, id={tool_id}, args={tool_args}")
        tool_call_info = f"[Calling tool {tool_name} with args {json.dumps(tool_args, indent=2)}]"
        all_outputs.append(tool_call_info)

        # Execute the tool call
        assert self.session is not None, "Session should be initialized at this point"
        result = await self.session.call_tool(  # type: ignore
            tool_name, cast(Dict[str, Any], tool_args)
        )
        logger.info(f"Tool result: {result.content}")

        # Store the result
        tool_results[tool_id] = result.content

        return tool_id

    async def _process_response_content(
        self, response: Any, all_outputs: List[str], tool_results: Dict[str, Any]
    ) -> Tuple[MessageParam, bool]:
        """Process response content and return the assistant message and tool_called flag."""
        # Flag to track if any tool was called in this iteration
        tool_called = False

        # Process the response and prepare the next message
        assistant_message: MessageParam = {"role": "assistant", "content": []}

        # Process each content block in the response
        for content in response.content:
            if content.type == "text":
                # Add text to outputs
                all_outputs.append(content.text)
                # Add text to the assistant message
                if isinstance(assistant_message["content"], list):
                    assistant_message["content"].append({"type": "text", "text": content.text})

            elif content.type == "tool_use":
                tool_called = True
                tool_id = await self._process_tool_use(content, all_outputs, tool_results)

                # Add the tool use to the assistant message
                if isinstance(assistant_message["content"], list):
                    assistant_message["content"].append(
                        {
                            "type": "tool_use",
                            "name": content.name,
                            "input": content.input,
                            "id": tool_id,
                        }
                    )

        return assistant_message, tool_called

    async def _add_tool_results(
        self, messages: List[MessageParam], response: Any, tool_results: Dict[str, Any]
    ) -> None:
        """Add tool results to the messages list."""
        for content in response.content:
            if content.type == "tool_use":
                tool_id = content.id
                result_content = tool_results.get(tool_id)
                if result_content:
                    # Add the tool result as a user message
                    tool_result_message: MessageParam = {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": tool_id,
                                "content": result_content,
                            }
                        ],
                    }
                    messages.append(tool_result_message)
                    logger.info(f"Added tool result for tool_use_id={tool_id}")

    async def process_query(
        self,
        query: str,
        max_tokens: int = 16384,
        temperature: float = 0.5,
        output_json_schema: Optional[str] = None,
        json_mode: bool = False,
    ) -> str:
        """Process a query using Claude and available tools, supporting dependent tool calls."""
        # Initialize conversation with user query
        messages: List[MessageParam] = [{"role": "user", "content": query}]

        # Use only enabled tools
        available_tools = self._prepare_available_tools()

        # Store all text outputs for final response
        all_outputs: List[str] = []

        # Track tool results for reference
        tool_results: Dict[str, Any] = {}

        # Continue conversation until Claude stops making tool calls
        conversation_turn = 0
        while True:
            conversation_turn += 1
            logger.info(f"Conversation turn {conversation_turn}")

            # Log the current state of the conversation
            for i, msg in enumerate(messages):
                logger.info(f"Message {i}: role={msg['role']}, content_type={type(msg['content'])}")

            # Get Claude's response
            response = await self._get_claude_response(
                messages,
                conversation_turn,
                available_tools,
                max_tokens,
                temperature,
                output_json_schema,
                json_mode,
            )

            # Process the response content
            assistant_message, tool_called = await self._process_response_content(
                response, all_outputs, tool_results
            )

            # Add the assistant message to the conversation
            if assistant_message["content"]:
                messages.append(assistant_message)
                content_len = (
                    len(assistant_message["content"])
                    if isinstance(assistant_message["content"], list)
                    else 0
                )
                logger.info(f"Added assistant message with {content_len} content items")

            # Add tool results for any tool calls
            await self._add_tool_results(messages, response, tool_results)

            # If no tool was called, we're done with the conversation
            if not tool_called:
                logger.info("No tools called, ending conversation")
                break

        # Return all outputs joined together
        return "\n".join(all_outputs)

    async def chat_loop(self):
        """Run an interactive chat loop."""
        print("\nMCP Client Started!")
        print("Available commands:")
        print("  'tools' - List all available tools")
        print("  'enabled' - List currently enabled tools")
        print("  'enable <tool1,tool2,...>' - Enable specific tools")
        print("  'enable all' - Enable all tools")
        print("  'quit' - Exit the program")

        while True:
            try:
                user_input = input("\nQuery or command: ").strip()

                if user_input.lower() == "quit":
                    break
                elif user_input.lower() == "tools":
                    tool_names = self.get_available_tool_names()
                    print("\nAvailable tools:")
                    for i, name in enumerate(tool_names, 1):
                        print(f"{i}. {name}")
                elif user_input.lower() == "enabled":
                    tool_names = self.get_enabled_tool_names()
                    print("\nCurrently enabled tools:")
                    for i, name in enumerate(tool_names, 1):
                        print(f"{i}. {name}")
                elif user_input.lower().startswith("enable "):
                    tools_arg = user_input[7:].strip()
                    if tools_arg.lower() == "all":
                        enabled = self.filter_tools()
                        print(f"\nEnabled all tools: {enabled}")
                    else:
                        tool_names = [t.strip() for t in tools_arg.split(",")]
                        enabled = self.filter_tools(tool_names)
                        print(f"\nEnabled tools: {enabled}")
                else:
                    # Process as a regular query
                    logger.info(f"Processing query: {user_input}")
                    response = await self.process_query(user_input)
                    print("\n" + response)

            except Exception as e:
                error_msg = f"\nError: {str(e)}"
                logger.error(error_msg)
                print(error_msg)

    async def cleanup(self):
        """Clean up resources."""
        await self.exit_stack.aclose()


async def main():
    if len(sys.argv) < 2:
        print("Usage: python client.py <path_to_server_script>")
        sys.exit(1)

    logger.info("Starting MCP Client")
    client = MCPClient()
    try:
        await client.connect_to_server("./weather/weather.py")
        await client.chat_loop()
    finally:
        await client.cleanup()


if __name__ == "__main__":
    asyncio.run(main())

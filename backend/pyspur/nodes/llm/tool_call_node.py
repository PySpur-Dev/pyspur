import json
from typing import ClassVar, Dict, List, Optional, Any

from jinja2 import Template
from pydantic import BaseModel, Field

# Comment out MCP import but keep for reference
# from ...api.mcp_management import get_mcp_client
from ...utils.pydantic_utils import json_schema_to_model
from ..base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ._utils import (
    LLMModels,
    ModelInfo,
    create_messages,
    generate_text_with_tools,
)


class ToolCallNodeInput(BaseNodeInput):
    """Input for the MCP Tool node."""

    class Config:
        """Config for the MCP Tool node input."""

        extra = "allow"


class ToolCall(BaseModel):
    name: str = Field(..., description="Name of the tool called")
    arguments: Dict[str, Any] = Field(..., description="Arguments passed to the tool")
    result: Any = Field(..., description="Result returned by the tool")


class ToolCallNodeOutput(BaseNodeOutput):
    """Output for the MCP Tool node."""

    pass


class ToolCallNodeConfig(BaseNodeConfig):
    """Configuration for the MCP Tool node."""

    llm_info: ModelInfo = Field(
        ModelInfo(model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7),
        description="The default LLM model to use",
    )

    system_message: str = Field(
        "You are a helpful assistant.",
        description="The system message for the LLM",
    )

    user_message: str = Field(
        "",
        description="The user message for the LLM, serialized from input_schema",
    )

    # Keep tool_names for backward compatibility
    # tool_names: Optional[List[str]] = Field(
    #     None,
    #     description="List of tool names to enable for this node. If None, all tools will be used.",
    # )

    # Add node_configs field to store the configs of connected nodes
    node_configs: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Dictionary of node_id to node config for connected nodes",
    )

    few_shot_examples: Optional[List[Dict[str, str]]] = None


class ToolCallNode(BaseNode):
    """Node type for calling MCP tools with a user message.

    This node allows selecting specific tools from available tools and passing a user message,
    which gives output similar to integration nodes or single_llm_call.py.
    """

    name = "tool_call_node"
    display_name = "Tool Call"

    config_model = ToolCallNodeConfig
    input_model = ToolCallNodeInput
    output_model = ToolCallNodeOutput

    _available_tools: ClassVar[List[str]] = []

    def setup(self) -> None:
        super().setup()
        if self.config.output_json_schema:
            self.output_model = json_schema_to_model(
                json.loads(self.config.output_json_schema),
                self.name,
                ToolCallNodeOutput,
            )  # type: ignore

    async def run(self, input: BaseModel) -> BaseModel:
        """Process user message using litellm with the configured tools."""
        # Comment out MCP client code but keep for reference
        # # Get the MCP client for tool definitions
        # client = await get_mcp_client()
        #
        # # Enable specific tools if configured
        # if self.config.tool_names is not None:
        #     client.filter_tools(self.config.tool_names)
        # else:
        #     # Enable all tools if none specified
        #     client.filter_tools()
        #
        # # Get available tools in the format litellm expects
        # tools = [
        #     {
        #         "type": "function",
        #         "function": {
        #             "name": tool.name,
        #             "description": tool.description,
        #             "parameters": tool.inputSchema,
        #         },
        #     }
        #     for tool in client.enabled_tools
        # ]

        # Create tools from node_configs
        tools = []
        # Ensure node_configs is not None
        node_configs = {} if self.config.node_configs is None else self.config.node_configs
        if node_configs:
            for node_id, _ in node_configs.items():
                # Create a tool for each connected node
                tool = {
                    "type": "function",
                    "function": {
                        "name": node_id,
                        "description": f"Tool for node {node_id}",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "input_data": {
                                    "type": "object",
                                    "description": "Input data for the node",
                                }
                            },
                            "required": ["input_data"],
                        },
                    },
                }
                tools.append(tool)

        # Grab the entire dictionary from the input
        raw_input_dict = input.model_dump()

        # Render user_message
        try:
            # If user_message is empty, dump the entire raw dictionary
            if not self.config.user_message.strip():
                user_message = json.dumps(raw_input_dict, indent=2)
            else:
                user_message = Template(self.config.user_message).render(**raw_input_dict)
        except Exception as e:
            print(f"[ERROR] Failed to render user_message in {self.name}")
            print(f"[ERROR] user_message: {self.config.user_message} with input: {raw_input_dict}")
            raise e

        # Create messages for the LLM
        messages = create_messages(
            system_message=self.config.system_message,
            user_message=user_message,
            few_shot_examples=self.config.few_shot_examples,
        )

        # print("toolss", tools)
        print("node_configs", node_configs)

        # # Debug logging for messages
        # print("=== Messages being sent to LLM ===")
        # for i, msg in enumerate(messages):
        #     print(f"Message {i}: {msg['role']} - {msg.get('content', 'None')}")

        # Process the user message using generate_text_with_tools
        response_str = await generate_text_with_tools(
            messages=messages,
            model_name=self.config.llm_info.model.value,
            temperature=self.config.llm_info.temperature or 0.7,
            max_tokens=self.config.llm_info.max_tokens or 16384,
            output_json_schema=self.config.output_json_schema,
            functions=tools if tools else None,
            function_call="auto",
            node_configs=node_configs,  # Pass node_configs to generate_text_with_tools
        )

        # Parse the response
        response_dict = json.loads(response_str)

        # Validate and return
        assistant_message = self.output_model.model_validate(response_dict)
        return assistant_message

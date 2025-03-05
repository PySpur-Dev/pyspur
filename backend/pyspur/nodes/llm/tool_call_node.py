import json
from typing import ClassVar, Dict, List, Optional

from jinja2 import Template
from pydantic import BaseModel, Field

from ...api.mcp_management import get_mcp_client
from ..base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ._utils import LLMModels, ModelInfo
from ...utils.pydantic_utils import json_schema_to_model

class ToolCallNodeInput(BaseNodeInput):
    """Input for the MCP Tool node."""

    class Config:
        """Config for the MCP Tool node input."""

        extra = "allow"


class ToolCallNodeOutput(BaseNodeOutput):
    """Output for the MCP Tool node."""
    pass
    # response: str = Field(..., description="The response from the MCP client")


# This will be dynamically populated with available tools
# class MCPToolEnum(str, Enum):
#     """Enum of available MCP tools."""

#     # Default value to ensure the enum is never empty
#     DEFAULT = "get_alerts"


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

    few_shot_examples: Optional[List[Dict[str, str]]] = None
    url_variables: Optional[Dict[str, str]] = Field(
        None,
        description="Optional mapping of URL types (image, video, pdf) to input schema variables for Gemini models",
    )
    # tool names is enum
    # tool_names: MCPToolEnum = Field(
    #     MCPToolEnum.DEFAULT,
    #     description="The tool names to use for this user message. If empty, all tools will be used.",
    # )
    # has_fixed_output: bool = True
    # output_json_schema: str = Field(
    #     default=json.dumps(MCPToolNodeOutput.model_json_schema()),
    #     description="The JSON schema for the output of the node",
    # )


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

    # Store available tools for the UI to use
    _available_tools: ClassVar[List[str]] = []
    # _tool_enum: ClassVar[Type[Enum]] = MCPToolEnum

    # def setup(self) -> None:
    #     """Setup method to initialize the node."""
    #     super().setup()

    # @classmethod
    # async def update_tool_enum(cls) -> Type[Enum]:
    #     """Update the tool enum with available tools."""
    #     try:
    #         # Get available tools
    #         client = await get_mcp_client()
    #         available_tools = client.get_available_tool_names()

    #         # Create a new enum with available tools
    #         if available_tools:
    #             enum_dict = {tool.upper().replace("-", "_"): tool for tool in available_tools}
    #             cls._tool_enum = Enum("MCPToolEnum", enum_dict)

    #         return cls._tool_enum
    #     except Exception:
    #         # Return the default enum if there's an error
    #         return MCPToolEnum

    def setup(self) -> None:
        super().setup()
        if self.config.output_json_schema:
            self.output_model = json_schema_to_model(
                json.loads(self.config.output_json_schema),
                self.name,
                ToolCallNodeOutput,
            )  # type: ignore

    async def run(self, input: BaseModel) -> BaseModel:
        """Process user message using the MCP client with the configured tools."""
        # Get the MCP client
        client = await get_mcp_client()

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
            print(
                f"[ERROR] user_message: {self.config.user_message} with input: {raw_input_dict}"
            )
            raise e

        # # Filter tools if specified in the config
        # if self.config.tool_names:
        #     client.filter_tools(self.config.tool_names)

        # Process the user message
        response = await client.process_query(user_message)
        response_dict = {
            "output": response,
        }
        # Return the response
        output = self.output_model.model_validate(response_dict)
        return output

    # @classmethod
    # async def get_available_tools(cls) -> List[str]:
    #     """Get the list of available tools from the MCP client."""
    #     try:
    #         client = await get_mcp_client()
    #         return client.get_available_tool_names()
    #     except Exception:
    #         return []

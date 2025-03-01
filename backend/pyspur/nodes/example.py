from typing import Dict

from pydantic import BaseModel, Field

from .base import Tool, ToolInput, ToolOutput
from .decorators import tool


class ExampleToolInput(ToolInput):
    """Input model for ExampleTool."""

    message: str = Field(description="The message to be repeated")


class ExampleToolOutput(ToolOutput):
    """Output model for ExampleTool."""

    output: str = Field(description="The output message")


class ExampleTool(Tool):
    """Example tool that demonstrates the simplified Tool usage.

    This tool can be initialized with config parameters directly:
    >>> tool = ExampleTool(name="my_tool", repeat_count=3)
    """

    # Tool configuration parameters
    repeat_count: int = Field(
        description="Number of times to repeat the message", default=1
    )
    input_model = ExampleToolInput
    output_model = ExampleToolOutput

    async def run(self, input: BaseModel) -> BaseModel:
        """Process the input and return the output.

        Args:
            input: The input data

        Returns:
            The output data with the message repeated

        """
        # Cast the input to the expected type for internal use
        typed_input = ExampleToolInput.model_validate(input.model_dump())

        # Access configuration parameters directly from self
        repeat_count = self.repeat_count
        output = typed_input.message * repeat_count

        # Return the output as the expected type
        return ExampleToolOutput(output=output)


# Example using the @tool decorator
@tool(
    category="Text",
    display_name="Message Transformer",
    has_fixed_output=True
)
async def transform_message(message: str, prefix: str = "", suffix: str = "", uppercase: bool = False) -> Dict[str, str]:
    """Transform a message by adding prefix/suffix and optionally converting to uppercase.
    
    Args:
        message: The message to transform
        prefix: Text to add before the message
        suffix: Text to add after the message
        uppercase: Whether to convert the message to uppercase
    
    Returns:
        A dictionary containing the transformed message

    """
    result = message

    if uppercase:
        result = result.upper()

    result = f"{prefix}{result}{suffix}"

    return {"output": result}


# Define a class for the output model to help with type checking
class MessageTransformerOutput(BaseModel):
    output: str


if __name__ == "__main__":
    import asyncio

    # Example 1: Using the class-based approach
    print("Example 1: Class-based tool")
    example_tool = ExampleTool(
        name="example_tool",
        repeat_count=3
    )

    # Call the tool with input data
    input_data = {"message": "Hello, World!"}
    output = asyncio.run(example_tool(input_data))
    # Cast to the known output type for proper type checking
    print(f"Input: {input_data}")
    print(f"Output: {output}")
    print()

    # Example 2: Using the decorator approach
    print("Example 2: Decorator-based tool")
    # Create an instance of the tool
    # The name parameter is required when creating a Tool instance
    message_transformer = transform_message(name="message_transformer")

    # Call the tool with input data
    input_data = {
        "message": "Hello, World!",
        "prefix": "[ ",
        "suffix": " ]",
        "uppercase": True
    }
    output = asyncio.run(message_transformer(input_data))
    # Cast to the known output type for proper type checking
    typed_output = MessageTransformerOutput.model_validate(output.model_dump())
    print(f"Input: {input_data}")
    print(f"Output: {typed_output.output}")
    print(message_transformer)

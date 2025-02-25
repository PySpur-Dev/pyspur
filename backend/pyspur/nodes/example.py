from pydantic import BaseModel, Field

from .base import BaseNode, BaseNodeInput, BaseNodeOutput


class ExampleNodeInput(BaseNodeInput):
    """Input model for ExampleNode."""

    message: str = Field(description="The message to be repeated")


class ExampleNodeOutput(BaseNodeOutput):
    """Output model for ExampleNode."""

    output: str = Field(description="The output message")


class ExampleNode(BaseNode):
    """Example node that demonstrates the simplified BaseNode usage.

    This node can be initialized with config parameters directly:
    >>> node = ExampleNode(name="my_node", repeat_count=3)
    """

    # Node configuration parameters
    repeat_count: int = Field(
        description="Number of times to repeat the message", default=1
    )
    input_model = ExampleNodeInput
    output_model = ExampleNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        """Process the input and return the output.

        Args:
            input: The input data

        Returns:
            The output data with the message repeated

        """
        # Cast the input to the expected type for internal use
        typed_input = ExampleNodeInput.model_validate(input.model_dump())

        # Access configuration parameters directly from self
        repeat_count = self.repeat_count
        output = typed_input.message * repeat_count

        # Return the output as the expected type
        return ExampleNodeOutput(output=output)


if __name__ == "__main__":
    import asyncio

    # Create a node instance with configuration parameters
    example_node = ExampleNode(
        name="example_node",
        repeat_count=3
    )

    # Call the node with input data
    input_data = {"message": "Hello, World!"}
    output = asyncio.run(example_node(input_data))
    print(output)

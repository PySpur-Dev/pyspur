
from pydantic import Field

from .base import BaseNode, BaseNodeInput, BaseNodeOutput


class ExampleNodeInput(BaseNodeInput):
    """Input model for ExampleNode."""

    pass


class ExampleNodeOutput(BaseNodeOutput):
    """Output model for ExampleNode."""

    output: str = Field(description="The processed message")


class ExampleNode(BaseNode):
    """Example node that demonstrates the simplified BaseNode usage.

    This node can be initialized with config parameters directly:
    >>> node = ExampleNode(name="my_node", message="Hi!", repeat_count=3)
    """

    # Node configuration parameters
    message: str = Field(description="The message to be repeated", default="Hello World!")
    repeat_count: int = Field(
        description="Number of times to repeat the message", default=1
    )
    _output_model = ExampleNodeOutput

    async def run(self, input: BaseNodeInput) -> BaseNodeOutput:
        """Process the input and return the output.

        Args:
            input: The input data

        Returns:
            The output data with the message repeated

        """
        # Access configuration parameters directly from self
        message = self.message
        repeat_count = self.repeat_count
        output = message * repeat_count
        return self.output_model.model_validate({"output": output})


if __name__ == "__main__":
    import asyncio

    # Create a node instance with configuration parameters
    example_node = ExampleNode(
        name="example_node",
        message="Hello, World!",
        repeat_count=3
    )

    # Call the node with an empty input
    output = asyncio.run(example_node({}))
    print(output)

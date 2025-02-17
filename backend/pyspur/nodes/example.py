from pydantic import BaseModel

from .base import BaseNode


class ExampleNodeConfig(BaseModel):
    """
    Configuration parameters for the ExampleNode.
    """

    pass


class ExampleNodeInput(BaseModel):
    """
    Input parameters for the ExampleNode.
    """

    name: str


class ExampleNodeOutput(BaseModel):
    """
    Output parameters for the ExampleNode.
    """

    greeting: str


class ExampleNode(BaseNode):
    """
    Example node that takes a name and returns a greeting.
    """

    name = "example"
    config_model = ExampleNodeConfig
    input_model = ExampleNodeInput
    output_model = ExampleNodeOutput

    def setup(self) -> None:
        self.input_model = ExampleNodeInput
        self.output_model = ExampleNodeOutput

    async def run(self, input_data: ExampleNodeInput) -> ExampleNodeOutput:
        return ExampleNodeOutput(greeting=f"Hello, {input_data.name}!")


if __name__ == "__main__":
    import asyncio

    example_node = ExampleNode(ExampleNodeConfig())
    output = asyncio.run(example_node(ExampleNodeInput(name="Alice")))
    print(output)

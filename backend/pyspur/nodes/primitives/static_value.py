from typing import Any, Dict

from pydantic import BaseModel

from ..base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class StaticValueNodeConfig(BaseNodeConfig):
    values: Dict[str, Any]


class StaticValueNodeInput(BaseNodeInput):
    pass


class StaticValueNodeOutput(BaseNodeOutput):
    pass


class StaticValueNode(BaseNode):
    """Node type for producing constant values declared in the config."""

    name = "constant_value_node"
    display_name = "Static Value"
    config_model = StaticValueNodeConfig
    input_model = StaticValueNodeInput
    output_model = StaticValueNodeOutput

    def setup(self) -> None:
        """Create a dynamic output model based on the values in the config."""
        # Convert the values dict to an output schema format
        output_schema = {key: type(value).__name__ for key, value in self.config.values.items()}

        # If there are no values, use a default empty output
        if not output_schema:
            return

        # Create a dynamic output model based on the schema
        self.output_model = self.create_output_model_class(output_schema)

    async def run(self, input: BaseModel) -> BaseModel:
        return self.output_model(**self.config.values)


if __name__ == "__main__":
    import asyncio

    # Create a proper config with the required fields
    config = StaticValueNodeConfig(values={"key": "value"})
    constant_value_node = StaticValueNode(name="test_node", config=config)
    output = asyncio.run(constant_value_node(StaticValueNodeInput()))
    print(output)

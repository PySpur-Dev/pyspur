from typing import Any, Dict

from pydantic import BaseModel

from ..base import BaseNode


class StaticValueNodeConfig(BaseModel):
    values: Dict[str, Any]


class StaticValueNodeInput(BaseModel):
    pass


class StaticValueNodeOutput(BaseModel):
    pass


class StaticValueNode(BaseNode):
    """
    Node type for producing constant values declared in the config.
    """

    name = "constant_value_node"
    display_name = "Static Value"
    config_model = StaticValueNodeConfig
    input_model = StaticValueNodeInput
    output_model = StaticValueNodeOutput

    def setup(self) -> None:
        self.input_model = StaticValueNodeInput
        self.output_model = self.get_model_for_value_dict(
            self.config.values, "ConstantValueNodeOutput"
        )

    async def run(self, input_data: BaseModel) -> BaseModel:
        return self.output_model(**self.config.values)


if __name__ == "__main__":
    import asyncio

    constant_value_node = StaticValueNode(StaticValueNodeConfig(values={"key": "value"}))
    output = asyncio.run(constant_value_node(BaseModel()))
    print(output)

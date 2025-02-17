from typing import Any, Dict, List

from pydantic import BaseModel, create_model

from ..base import (
    BaseNode,
    BaseNodeConfig,
    BaseNodeInput,
    BaseNodeOutput,
)


class InputNodeConfig(BaseNodeConfig):
    """
    Configuration for the InputNode.
    enforce_schema: bool = False. If True, the output_schema will be enforced. Otherwise the output will be the same as the input.
    output_schema: Dict[str, str] = {"input_1": "string"}. The schema of the output.
    """

    enforce_schema: bool = False
    output_schema: Dict[str, str] = {"input_1": "string"}
    output_json_schema: str = '{"type": "object", "properties": {"input_1": {"type": "string"} } }'
    pass


class InputNodeInput(BaseNodeInput):
    pass


class InputNodeOutput(BaseNodeOutput):
    pass


class InputNode(BaseNode):
    """
    Node for defining dataset schema and using the output as input for other nodes.
    """

    name = "input_node"
    display_name = "Input"
    config_model = InputNodeConfig
    input_model = InputNodeInput
    output_model = InputNodeOutput

    async def __call__(
        self,
        input: (
            Dict[str, str | int | bool | float | Dict[str, Any] | List[Any]]
            | Dict[str, BaseNodeOutput]
            | Dict[str, BaseNodeInput]
            | BaseNodeInput
        ),
    ) -> BaseNodeOutput:
        if isinstance(input, dict):
            if not any(isinstance(value, BaseNodeOutput) for value in input.values()):
                # create a new model based on the input dictionary
                fields = {key: (type(value), ...) for key, value in input.items()}
                self.output_model = create_model(  # type: ignore
                    self.name,
                    __base__=BaseNodeOutput,
                    **fields,  # type: ignore
                )
                return self.output_model.model_validate(input)  # type: ignore
        return await super().__call__(input)

    async def run(self, input: BaseModel) -> BaseModel:
        if self.config.enforce_schema:
            return input
        else:
            fields = {key: (value, ...) for key, value in input.model_fields.items()}

            new_output_model = create_model(
                "InputNodeOutput",
                __base__=InputNodeOutput,
                __config__=None,
                __module__=self.__module__,
                __doc__=f"Output model for {self.name} node",
                __validators__=None,
                __cls_kwargs__=None,
                **fields,
            )
            self.output_model = new_output_model
            ret_value = self.output_model.model_validate(input.model_dump())  # type: ignore
            return ret_value  # type: ignore

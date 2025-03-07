from typing import Any, Dict, List, cast

from pydantic import BaseModel, Field, create_model

from ..base import Tool, ToolOutput


class InputNode(Tool):
    """Node for defining dataset schema and using the output as input for other nodes.
    """

    name: str = "input_node"

    # Configuration parameters
    enforce_schema: bool = Field(
        default=False,
        title="Enforce Schema",
        description="If True, the output_schema will be enforced. Otherwise the output will be the same as the input."
    )
    output_schema: Dict[str, str] = Field(
        default={"input_1": "string"},
        title="Output Schema",
        description="The schema of the output."
    )
    output_json_schema: str = Field(
        default='{"type": "object", "properties": {"input_1": {"type": "string"} } }',
        title="Output JSON Schema",
        description="JSON schema representation of the output schema."
    )

    async def __call__(
        self,
        input: (
            Dict[str, str | int | bool | float | Dict[str, Any] | List[Any]]
            | Dict[str, BaseModel]
            | BaseModel
        ),
    ) -> BaseModel:
        if isinstance(input, dict):
            if not any(isinstance(value, BaseModel) for value in input.values()):
                # create a new model based on the input dictionary
                fields: Dict[str, Any] = {}
                for key, value in input.items():
                    fields[key] = (type(value), ...)

                # Use type ignore for the create_model call
                dynamic_model = create_model(  # type: ignore
                    self.name,
                    __base__=ToolOutput,
                    **fields,
                )
                self.output_model = dynamic_model
                return cast(BaseModel, self.output_model.model_validate(input))
        return await super().__call__(input)

    async def run(self, input: BaseModel) -> BaseModel:
        if self.enforce_schema:
            return input
        else:
            fields = {key: (value, ...) for key, value in input.model_fields.items()}

            new_output_model = create_model(
                "InputNodeOutput",
                __base__=BaseModel,
                __config__=None,
                __module__=self.__module__,
                __doc__=f"Output model for {self.name} node",
                __validators__=None,
                __cls_kwargs__=None,
                **fields,
            )
            self.output_model = new_output_model
            return self.output_model.model_validate(input.model_dump())

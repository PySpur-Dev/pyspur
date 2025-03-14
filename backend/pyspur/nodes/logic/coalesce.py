from typing import Any, Dict, List, Optional, Type

from pydantic import BaseModel, Field, create_model

from ..base import Tool


class CoalesceNodeOutput(BaseModel):
    """Output model for the coalesce node."""

    class Config:
        arbitrary_types_allowed = True

    pass


class CoalesceNode(Tool):
    """A Coalesce node that takes multiple incoming branches and outputs
    the first non-null branch's value as its result.
    """

    name: str = "coalesce_node"
    output_model: Type[BaseModel] = CoalesceNodeOutput

    # Configuration fields moved from CoalesceNodeConfig
    preferences: List[str] = Field(default_factory=list, description="Order of preference for inputs")

    def model_post_init(self, _: Any) -> None:
        """Initialize after Pydantic model initialization."""
        super().model_post_init(_)
        # Set display name
        self.display_name = "Coalesce"

    async def run(self, input: BaseModel) -> BaseModel:
        """The `input` here is typically a Pydantic model whose fields correspond
        to each upstream dependency. Some may be None, some may be a valid
        BaseModel/dict. We find the first non-None field and return it.
        """
        self.output_model = CoalesceNodeOutput

        data = input.model_dump()
        first_non_null_output: Dict[str, Optional[BaseModel]] = {}

        # Iterate over the keys based on the order specified in preferences
        for key in self.preferences:
            if key in data and data[key] is not None:
                # Return the first non-None value according to preferences
                output_model = create_model(
                    f"{self.name}",
                    **{
                        k: (type(v), ...) for k, v in data[key].items()
                    },  # Only include the first non-null key
                    __base__=CoalesceNodeOutput,
                    __config__=None,
                    __module__=self.__module__,
                    __doc__=f"Output model for {self.name} node",
                    __validators__=None,
                    __cls_kwargs__=None,
                )
                self.output_model = output_model
                first_non_null_output = data[key]
                return self.output_model(**first_non_null_output)

        # If all preferred values are None, check the rest of the data
        for key, value in data.items():
            if value is not None:
                # Return the first non-None value immediately
                output_model = create_model(
                    f"{self.name}",
                    **{
                        k: (type(v), ...) for k, v in value.items()
                    },  # Only include the first non-null key
                    __base__=CoalesceNodeOutput,
                    __config__=None,
                    __module__=self.__module__,
                    __doc__=f"Output model for {self.name} node",
                    __validators__=None,
                    __cls_kwargs__=None,
                )
                self.output_model = output_model
                return self.output_model(**value)

        # If all values are None, return an empty output
        return None  # type: ignore

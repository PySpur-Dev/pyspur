import logging
from typing import Any, Optional, Type

from pydantic import BaseModel, create_model

from ..base import Tool

logger = logging.getLogger(__name__)


class MergeNodeOutput(BaseModel):
    """Output model for the merge node."""

    class Config:
        arbitrary_types_allowed = True

    pass


class MergeNode(Tool):
    """Merge node takes all its inputs and combines them into one output
    """

    name: str = "merge_node"
    output_model: Type[BaseModel] = MergeNodeOutput

    def model_post_init(self, _: Any) -> None:
        """Initialize after Pydantic model initialization."""
        super().model_post_init(_)
        # Set display name
        self.display_name = "Merge"
        # Set has_fixed_output to False
        self.has_fixed_output = False

    async def run(self, input: BaseModel) -> BaseModel:
        data = input.model_dump()

        self.output_model = create_model(
            f"{self.name}",
            **{
                k: (Optional[type(v)], ...) for k, v in data.items()
            },
            __base__=MergeNodeOutput,
            __config__=None,
            __module__=self.__module__,
            __doc__=f"Output model for {self.name} node",
            __validators__=None,
            __cls_kwargs__=None,
        )
        return self.output_model(**data)


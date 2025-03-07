from enum import Enum as PyEnum
from typing import Any, Optional

from pydantic import BaseModel, Field

from ..base import Tool
from ..registry import NodeRegistry


class PauseException(Exception):
    """Raised when a workflow execution needs to pause for human intervention."""

    def __init__(self, node_id: str, message: str = "Human intervention required", output: Optional[BaseModel] = None):
        self.node_id = node_id
        self.message = message
        self.output = output
        super().__init__(f"Workflow paused at node {node_id}: {message}")


class PauseAction(PyEnum):
    """Actions that can be taken on a paused workflow."""

    APPROVE = "APPROVE"
    DECLINE = "DECLINE"
    OVERRIDE = "OVERRIDE"


class HumanInterventionNodeOutput(BaseModel):
    """Output model for the human intervention node that passes through input data.
    This base model allows all extra fields from the input to pass through.
    """

    class Config:
        extra = "allow"  # Allow extra fields from the input to pass through


@NodeRegistry.register(
    category="Logic",
    display_name="HumanIntervention",
    # logo="/images/human_intervention.png",
    position="after:RouterNode"
)
class HumanInterventionNode(Tool):
    """A node that pauses workflow execution and waits for human input.

    When this node is executed, it pauses the workflow until human intervention
    occurs. All input data is passed through to the output after approval.
    """

    name: str = "human_intervention_node"

    # Configuration parameters
    message: str = Field(
        default="Human intervention required",
        description="Message to display to the user when workflow is paused"
    )
    block_only_dependent_nodes: bool = Field(
        default=True,
        description="If True, only nodes that depend on this node's output will be blocked. If False, all downstream nodes will be blocked."
    )

    # Set default output model
    output_model = HumanInterventionNodeOutput

    def model_post_init(self, _: Any) -> None:
        """Initialize after Pydantic model initialization."""
        super().model_post_init(_)
        # Set display name
        self.display_name = "Human Intervention"

    def setup(self) -> None:
        """Setup method for the human intervention node.
        """
        super().setup()

    @property
    def node_id(self) -> str:
        # Return the node id from the instance dict if available, otherwise fallback to self.name
        return str(self.__dict__.get('id', self.name))

    async def run(self, input: BaseModel) -> BaseModel:
        """Process input and pause the workflow execution,
        preserving the nested structure so that downstream nodes can access outputs as {{HumanInterventionNode_1.input_node.input_1}}.
        """
        # Pass through the input data to preserve the nested structure
        output_dict = input.model_dump()
        output = HumanInterventionNodeOutput(**output_dict)
        raise PauseException(str(self.node_id), self.message, output)

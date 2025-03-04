from typing import Optional
from enum import Enum as PyEnum

from pydantic import BaseModel, Field

from ..base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ..registry import NodeRegistry

class PauseException(Exception):
    """Raised when a workflow execution needs to pause for human intervention."""
    def __init__(self, node_id: str, message: str = "Human intervention required", output: Optional[BaseNodeOutput] = None):
        self.node_id = node_id
        self.message = message
        self.output = output
        super().__init__(f"Workflow paused at node {node_id}: {message}")

class PauseAction(PyEnum):
    """Actions that can be taken on a paused workflow."""
    APPROVE = "APPROVE"
    DECLINE = "DECLINE"
    OVERRIDE = "OVERRIDE"


class HumanInterventionNodeConfig(BaseNodeConfig):
    """
    Configuration for a human intervention node.
    This node type pauses workflow execution until human input is provided.
    """
    message: str = Field(
        default="Human intervention required",
        description="Message to display to the user when workflow is paused"
    )
    block_only_dependent_nodes: bool = Field(
        default=True,
        description="If True, only nodes that depend on this node's output will be blocked. If False, all downstream nodes will be blocked."
    )


class HumanInterventionNodeInput(BaseNodeInput):
    """Input model for the human intervention node."""
    class Config:
        extra = "allow"


class HumanInterventionNodeOutput(BaseNodeOutput):
    """
    Output model for the human intervention node that passes through input data.
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
class HumanInterventionNode(BaseNode):
    """
    A node that pauses workflow execution and waits for human input.

    When this node is executed, it pauses the workflow until human intervention
    occurs. All input data is passed through to the output after approval.
    """
    name = "human_intervention_node"
    config_model = HumanInterventionNodeConfig
    input_model = HumanInterventionNodeInput
    output_model = HumanInterventionNodeOutput

    def setup(self) -> None:
        """
        Setup method for the human intervention node.
        """
        super().setup()

    @property
    def node_id(self) -> str:
        # Return the node id from the instance dict if available, otherwise fallback to self.name
        return str(self.__dict__.get('id', self.name))

    async def run(self, input: BaseModel) -> BaseNodeOutput:
        """
        Process input and pause the workflow execution,
        preserving the nested structure so that downstream nodes can access outputs as {{HumanInterventionNode_1.input_node.input_1}}.
        """
        # Pass through the input data to preserve the nested structure
        output_dict = input.model_dump()
        output = HumanInterventionNodeOutput(**output_dict)
        raise PauseException(str(self.node_id), self.config.message, output)

    def _flatten_input(self, input_dict: dict) -> dict:
        """
        Flatten nested input dictionaries to make fields directly accessible.

        Args:
            input_dict: The input dictionary to flatten

        Returns:
            A flattened dictionary where nested values are moved to the top level
        """
        flat_input = {}
        for key, value in input_dict.items():
            if isinstance(value, dict):
                # Add each field from nested dicts directly to the output
                flat_input.update(value)
            else:
                flat_input[key] = value

        return flat_input
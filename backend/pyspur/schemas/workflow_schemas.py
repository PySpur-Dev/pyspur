import json
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, field_validator, model_validator
from typing_extensions import Self

from ..utils.pydantic_utils import json_schema_to_model


class SpurType(str, Enum):
    """Enum representing the type of spur.

    Workflow: Standard workflow with nodes and edges
    Chatbot: Essentially a workflow with chat compatible IO and session management
    Agent: Autonomous agent node that calls tools, also has chat compatible IO
        and session management
    """

    WORKFLOW = "workflow"
    CHATBOT = "chatbot"
    AGENT = "agent"


class WorkflowNodeCoordinatesSchema(BaseModel):
    """Coordinates for a node in a workflow."""

    x: float
    y: float


class WorkflowNodeDimensionsSchema(BaseModel):
    """Dimensions for a node in a workflow."""

    width: float
    height: float


class WorkflowNodeSchema(BaseModel):
    """A single step in a workflow.

    Each node receives a dictionary mapping predecessor node IDs to their outputs.
    For dynamic schema nodes, the output schema is defined in the config dictionary.
    For static schema nodes, the output schema is defined in the node class implementation.
    """

    id: str  # ID in the workflow
    title: str = ""  # Display name
    parent_id: Optional[str] = None  # ID of the parent node
    node_type: str  # Name of the node type
    config: Dict[
        str, Any
    ] = {}  # Configuration parameters including dynamic output schema if needed
    coordinates: Optional[WorkflowNodeCoordinatesSchema] = (
        None  # Position of the node in the workflow
    )
    dimensions: Optional[WorkflowNodeDimensionsSchema] = (
        None  # Dimensions of the node in the workflow
    )
    subworkflow: Optional["WorkflowDefinitionSchema"] = None  # Sub-workflow definition

    @model_validator(mode="after")
    def default_title_to_id(self) -> Self:
        if self.title.strip() == "":
            self.title = self.id
        return self

    @model_validator(mode="after")
    def prefix_model_name_with_provider(self) -> Self:
        # We need this to handle spurs created earlier than the prefixing change
        if self.node_type in ("SingleLLMCallNode", "BestOfNNode"):
            llm_info = self.config.get("llm_info")
            assert llm_info is not None
            if (
                llm_info["model"].startswith("gpt")
                or llm_info["model"].startswith("chatgpt")
                or llm_info["model"].startswith("o1")
            ):
                llm_info["model"] = f"openai/{llm_info['model']}"
            if llm_info["model"].startswith("claude"):
                llm_info["model"] = f"anthropic/{llm_info['model']}"
        return self


class WorkflowLinkSchema(BaseModel):
    """Connect a source node to a target node.

    The target node will receive the source node's output in its input dictionary.
    """

    source_id: str
    target_id: str
    source_handle: Optional[str] = None  # The output handle from the source node
    target_handle: Optional[str] = None  # The input handle on the target node


class WorkflowDefinitionSchema(BaseModel):
    """A workflow is a DAG of nodes."""

    nodes: List[WorkflowNodeSchema]
    links: List[WorkflowLinkSchema]
    test_inputs: List[Dict[str, Any]] = []
    spur_type: SpurType = SpurType.WORKFLOW

    @classmethod
    @field_validator("nodes")
    def nodes_must_have_unique_ids(cls, v: List[WorkflowNodeSchema]):
        node_ids = [node.id for node in v]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("Node IDs must be unique.")
        return v

    @classmethod
    @field_validator("nodes")
    def must_have_one_and_only_one_input_node(cls, v: List[WorkflowNodeSchema]):
        input_nodes = [
            node for node in v if node.node_type == "InputNode" and node.parent_id is None
        ]
        if len(input_nodes) != 1:
            raise ValueError("Workflow must have exactly one input node.")
        return v

    @classmethod
    @field_validator("nodes")
    def must_have_at_most_one_output_node(cls, v: List[WorkflowNodeSchema]):
        output_nodes = [
            node for node in v if node.node_type == "OutputNode" and node.parent_id is None
        ]
        if len(output_nodes) > 1:
            raise ValueError("Workflow must have at most one output node.")
        return v

    @model_validator(mode="after")
    def validate_router_node_links(self) -> Self:
        """Validate links connected to RouterNodes.

        They must have correctly formatted target handles.
        For RouterNodes, the target handle should match the format: source_node_id.handle_id
        """
        for link in self.links:
            source_node = next((node for node in self.nodes if node.id == link.source_id), None)
            if source_node and source_node.node_type == "RouterNode":
                target_handle = link.target_handle or link.source_id

                # If target_handle contains a dot, take only what's after the dot
                if target_handle.find(".") != -1:
                    target_handle = target_handle.split(".")[-1]

                # Ensure it has the correct prefix
                if not target_handle.startswith(f"{link.source_id}."):
                    link.target_handle = f"{link.source_id}.{target_handle}"

        return self

    @model_validator(mode="after")
    def validate_chatbot_input_node(self) -> Self:  # noqa: C901
        """Validate that chatbot workflows have the required input fields.

        For chatbot workflows, the input node must have user_message and session_id fields.
        """
        if self.spur_type == SpurType.CHATBOT:
            # chatbot workflows must have input node with the following fields:
            # user_message, session_id
            input_node = next(
                (
                    node
                    for node in self.nodes
                    if node.node_type == "InputNode" and node.parent_id is None
                ),
                None,
            )
            if input_node:
                try:
                    json_schema = json.loads(input_node.config.get("output_json_schema", "{}"))
                    model = json_schema_to_model(json_schema)
                    output_schema = model.model_fields
                    missing_fields: List[str] = []

                    if "user_message" not in output_schema:
                        missing_fields.append("user_message")
                    elif output_schema["user_message"].annotation is not str:
                        missing_fields.append("user_message (must be of type str)")

                    if "session_id" not in output_schema:
                        missing_fields.append("session_id")
                    elif output_schema["session_id"].annotation is not str:
                        missing_fields.append("session_id (must be of type str)")

                    if missing_fields:
                        raise ValueError(
                            f"Chatbot input node must have the following mandatory fields: "
                            f"{', '.join(missing_fields)}"
                        )
                except json.JSONDecodeError:
                    raise ValueError(
                        "Invalid JSON schema in input node output_json_schema"
                    ) from None
        return self

    @model_validator(mode="after")
    def validate_chatbot_output_node(self) -> Self:
        """Validate that chatbot workflows have the required output fields."""
        if self.spur_type == SpurType.CHATBOT:
            # chatbot workflows must have output node with assistant_message field
            output_node = next(
                (
                    node
                    for node in self.nodes
                    if node.node_type == "OutputNode" and node.parent_id is None
                ),
                None,
            )
            if output_node:
                try:
                    json_schema = json.loads(output_node.config.get("output_json_schema", "{}"))
                    model = json_schema_to_model(json_schema)
                    output_schema = model.model_fields
                    missing_fields: List[str] = []

                    if "assistant_message" not in output_schema:
                        missing_fields.append("assistant_message")
                    elif output_schema["assistant_message"].annotation is not str:
                        missing_fields.append("assistant_message (must be of type str)")

                    if missing_fields:
                        raise ValueError(
                            f"Chatbot output node must have the following mandatory fields: "
                            f"{', '.join(missing_fields)}"
                        )
                except json.JSONDecodeError:
                    raise ValueError(
                        "Invalid JSON schema in output node output_json_schema"
                    ) from None

        return self

    model_config = {"from_attributes": True}


class WorkflowCreateRequestSchema(BaseModel):
    """A request to create a new workflow."""

    name: str
    description: str = ""
    definition: Optional[WorkflowDefinitionSchema] = None


class WorkflowResponseSchema(BaseModel):
    """A response containing the details of a workflow."""

    id: str
    name: str
    description: Optional[str]
    definition: WorkflowDefinitionSchema
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkflowVersionResponseSchema(BaseModel):
    """A response containing the details of a workflow version."""

    version: int
    name: str
    description: Optional[str]
    definition: Any
    definition_hash: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

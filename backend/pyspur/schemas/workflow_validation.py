from ..nodes.node_types import is_valid_node_type
from .workflow_schemas import WorkflowDefinitionSchema, WorkflowNodeSchema


def validate_node_type(node: WorkflowNodeSchema) -> bool:
    """Validate that a node's type is supported."""
    return is_valid_node_type(node.node_type)


def validate_workflow_definition(workflow: WorkflowDefinitionSchema) -> bool:
    """
    Validate a workflow definition.
    Returns True if valid, raises ValueError if invalid.
    """
    # Validate all node types are supported
    for node in workflow.nodes:
        if not validate_node_type(node):
            raise ValueError(f"Node type '{node.node_type}' is not valid.")

    return True

import importlib
from typing import Any, Dict, List, Optional, cast

from ..schemas.node_type_schemas import NodeTypeSchema
from .base import BaseNode
from .node_types import (
    SUPPORTED_NODE_TYPES,
    get_all_node_types,
    is_valid_node_type,
)
from .registry import NodeRegistry


class NodeFactory:
    """Factory for creating node instances from a configuration.
    Supports both decorator-based registration and legacy configured registration.

    Conventions:
    - The node class should be named <NodeTypeName>Node
    - The input model should be named <NodeTypeName>NodeInput
    - The output model should be named <NodeTypeName>NodeOutput
    - There should be only one node type class per module

    Nodes can be registered in two ways:
    1. Using the @NodeRegistry.register decorator (recommended)
    2. Through the legacy configured SUPPORTED_NODE_TYPES in node_types.py
    """

    @staticmethod
    def get_all_node_types() -> Dict[str, List[NodeTypeSchema]]:
        """Returns a dictionary of all available node types grouped by category.
        Combines both decorator-registered and configured nodes.
        """
        # Get nodes from both sources
        configured_nodes = get_all_node_types()
        registered_nodes = NodeRegistry.get_registered_nodes()

        # Convert registered nodes to NodeTypeSchema
        converted_nodes: Dict[str, List[NodeTypeSchema]] = {}
        for category, nodes in registered_nodes.items():
            if category not in converted_nodes:
                converted_nodes[category] = []
            for node in nodes:
                schema = NodeTypeSchema(
                    node_type_name=cast(str, node["node_type_name"]),
                    module=cast(str, node["module"]),
                    class_name=cast(str, node["class_name"]),
                )
                converted_nodes[category].append(schema)

        # Merge nodes, giving priority to configured ones
        result = configured_nodes.copy()
        for category, nodes in converted_nodes.items():
            if category not in result:
                result[category] = []
            # Only add nodes that aren't already present
            for node in nodes:
                if not any(n.node_type_name == node.node_type_name for n in result[category]):
                    result[category].append(node)

        return result

    @staticmethod
    def create_node(node_name: str, node_type_name: str, config: Dict[str, Any]) -> BaseNode:
        """Creates a node instance from a configuration.
        Checks both registration methods for the node type.
        """
        if not is_valid_node_type(node_type_name):
            raise ValueError(f"Node type '{node_type_name}' is not valid.")

        module_name: Optional[str] = None
        class_name: Optional[str] = None

        # First check configured nodes
        for node_group in SUPPORTED_NODE_TYPES.values():
            for node_type in node_group:
                if node_type["node_type_name"] == node_type_name:
                    module_name = node_type["module"]
                    class_name = node_type["class_name"]
                    break
            if module_name and class_name:
                break

        # If not found, check registry
        if not module_name or not class_name:
            registered_nodes = NodeRegistry.get_registered_nodes()
            for nodes in registered_nodes.values():
                for node in nodes:
                    if node["node_type_name"] == node_type_name:
                        module_name = node["module"]
                        class_name = node["class_name"]
                        break
                if module_name and class_name:
                    break

        if not module_name or not class_name:
            raise ValueError(f"Node type '{node_type_name}' not found.")

        # At this point, we know module_name and class_name are not None
        assert module_name is not None, "Module name should not be None at this point"
        assert class_name is not None, "Class name should not be None at this point"

        module = importlib.import_module(module_name, package="pyspur")
        node_class = getattr(module, class_name)

        # Create the node with config parameters passed directly
        return node_class(name=node_name, **config)

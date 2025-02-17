# backend/app/nodes/registry.py
import importlib
import importlib.util
from pathlib import Path
from typing import Dict, List, Optional, Set, Type, Union

from loguru import logger

from .base import BaseNode


class NodeRegistry:
    _nodes: Dict[str, List[Dict[str, Union[str, Optional[str]]]]] = {}
    _decorator_registered_classes: Set[Type[BaseNode]] = (
        set()
    )  # Track classes registered via decorator

    @classmethod
    def register(
        cls,
        category: str = "Uncategorized",
        display_name: Optional[str] = None,
        logo: Optional[str] = None,
        subcategory: Optional[str] = None,
        position: Optional[Union[int, str]] = None,
    ):
        """
        Decorator to register a node class with metadata.

        Args:
            category: The category this node belongs to
            display_name: Optional display name for the node
            logo: Optional path to the node's logo
            subcategory: Optional subcategory for finer-grained organization
            position: Optional position specifier. Can be:
                     - Integer for absolute position
                     - "after:NodeName" for relative position after a node
                     - "before:NodeName" for relative position before a node
        """

        def decorator(node_class: Type[BaseNode]) -> Type[BaseNode]:
            # Set metadata on the class
            if not hasattr(node_class, "category"):
                node_class.category = category
            if display_name:
                node_class.display_name = display_name
            if logo:
                node_class.logo = logo

            # Store subcategory as class attribute without type checking
            if subcategory:
                setattr(node_class, "subcategory", subcategory)

            # Initialize category if not exists
            if category not in cls._nodes:
                cls._nodes[category] = []

            # Create node registration info
            # Remove 'app.' prefix from module path if present
            module_path = node_class.__module__
            if module_path.startswith("pyspur."):
                module_path = module_path.replace("pyspur.", "", 1)

            node_info: Dict[str, Union[str, Optional[str]]] = {
                "node_type_name": node_class.__name__,
                "module": f".{module_path}",
                "class_name": node_class.__name__,
                "subcategory": subcategory,
            }

            # Handle positioning
            nodes_list = cls._nodes[category]
            if position is not None:
                if isinstance(position, int):
                    # Insert at specific index
                    insert_idx = min(position, len(nodes_list))
                    nodes_list.insert(insert_idx, node_info)
                elif position.startswith("after:"):
                    target_node = position[6:]
                    for i, n in enumerate(nodes_list):
                        if n["node_type_name"] == target_node:
                            nodes_list.insert(i + 1, node_info)
                            break
                    else:
                        nodes_list.append(node_info)
                elif position.startswith("before:"):
                    target_node = position[7:]
                    for i, n in enumerate(nodes_list):
                        if n["node_type_name"] == target_node:
                            nodes_list.insert(i, node_info)
                            break
                    else:
                        nodes_list.append(node_info)
                else:
                    nodes_list.append(node_info)
            else:
                # Add to end if no position specified
                if not any(n["node_type_name"] == node_class.__name__ for n in nodes_list):
                    nodes_list.append(node_info)
                    logger.debug(f"Registered node {node_class.__name__} in category {category}")
                    cls._decorator_registered_classes.add(node_class)

            return node_class

        return decorator

    @classmethod
    def get_registered_nodes(
        cls,
    ) -> Dict[str, List[Dict[str, Union[str, Optional[str]]]]]:
        """Get all registered nodes."""
        return cls._nodes

    @classmethod
    def _discover_in_directory(cls, base_path: Path, package_prefix: str) -> None:
        """
        Recursively discover nodes in a directory and its subdirectories.
        Only registers nodes that explicitly use the @NodeRegistry.register decorator.
        """
        # Get all Python files in current directory
        for item in base_path.iterdir():
            if item.is_file() and item.suffix == ".py" and not item.name.startswith("_"):
                # Construct module name from package prefix and file name
                module_name = f"{package_prefix}.{item.stem}"

                try:
                    # Import module but don't register nodes - they'll self-register if decorated
                    importlib.import_module(module_name)
                except Exception as e:
                    logger.error(f"Failed to load module {module_name}: {e}")

            # Recursively process subdirectories
            elif item.is_dir() and not item.name.startswith("_"):
                subpackage = f"{package_prefix}.{item.name}"
                cls._discover_in_directory(item, subpackage)

    @classmethod
    def discover_nodes(cls, package_path: str = "pyspur.nodes") -> None:
        """
        Automatically discover and register nodes from the package.
        Only nodes with the @NodeRegistry.register decorator will be registered.

        Args:
            package_path: The base package path to search for nodes
        """
        try:
            package = importlib.import_module(package_path)
            if not hasattr(package, "__file__") or package.__file__ is None:
                raise ImportError(f"Cannot find package {package_path}")

            base_path = Path(package.__file__).resolve().parent
            logger.info(f"Discovering nodes in: {base_path}")

            # Start recursive discovery
            cls._discover_in_directory(base_path, package_path)

            logger.info(
                f"Node discovery complete. Found {len(cls._decorator_registered_classes)} decorated nodes."
            )

        except ImportError as e:
            logger.error(f"Failed to import base package {package_path}: {e}")

# backend/app/nodes/registry.py
import importlib
import importlib.util
import os
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Type, Union

from loguru import logger

from ..schemas.node_type_schemas import NodeTypeSchema
from .base import BaseNode
from .decorator import FunctionToolNode, ToolFunction


class NodeInfo(NodeTypeSchema):
    subcategory: Optional[str] = None


class NodeRegistry:
    _nodes: Dict[str, List[NodeInfo]] = {}
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
        """Register a node class with metadata.

        Args:
            category: The category this node belongs to
            display_name: Optional display name for the node
            logo: Optional path to the node's logo
            subcategory: Optional subcategory for finer-grained organization
            position: Optional position specifier. Can be:
                     - Integer for absolute position
                     - "after:NodeName" for relative position after a node
                     - "before:NodeName" for relative position before a node

        Returns:
            A decorator that registers the node class with the specified metadata

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
                node_class.subcategory = subcategory

            # Initialize category if not exists
            if category not in cls._nodes:
                cls._nodes[category] = []

            # Create node registration info
            # Remove 'app.' prefix from module path if present
            module_path = node_class.__module__
            if module_path.startswith("pyspur."):
                module_path = module_path.replace("pyspur.", "", 1)

            node_info = NodeInfo(
                node_type_name=node_class.__name__,
                module=f".{module_path}",
                class_name=node_class.__name__,
                subcategory=subcategory,
            )

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
                        if n.node_type_name == target_node:
                            nodes_list.insert(i + 1, node_info)
                            break
                    else:
                        nodes_list.append(node_info)
                elif position.startswith("before:"):
                    target_node = position[7:]
                    for i, n in enumerate(nodes_list):
                        if n.node_type_name == target_node:
                            nodes_list.insert(i, node_info)
                            break
                    else:
                        nodes_list.append(node_info)
                else:
                    nodes_list.append(node_info)
            else:
                # Add to end if no position specified
                if not any(n.node_type_name == node_class.__name__ for n in nodes_list):
                    nodes_list.append(node_info)
                    logger.debug(f"Registered node {node_class.__name__} in category {category}")
                    cls._decorator_registered_classes.add(node_class)

            return node_class

        return decorator

    @classmethod
    def get_registered_nodes(
        cls,
    ) -> Dict[str, List[NodeInfo]]:
        """Get all registered nodes."""
        cls.discover_nodes()
        return cls._nodes

    @classmethod
    def _discover_in_directory(cls, base_path: Path, package_prefix: str) -> None:
        """Recursively discover nodes in a directory and its subdirectories.

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
        """Automatically discover and register nodes from the package.

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

            # Also discover tool function nodes
            cls.discover_tool_functions()

            logger.info(
                "Node discovery complete."
                f" Found {len(cls._decorator_registered_classes)} decorated nodes."
            )

        except ImportError as e:
            logger.error(f"Failed to import base package {package_path}: {e}")

    @classmethod
    def discover_tool_functions(cls) -> None:
        """Discover and register tool functions from the tools directory.

        This method searches recursively through Python files in the PROJECT_ROOT/tools directory
        for functions decorated with @tool_function and registers their node classes.
        Only works with proper Python packages (directories with __init__.py).
        """
        # Get PROJECT_ROOT from environment variable
        project_root = os.getenv("PROJECT_ROOT")
        if not project_root:
            logger.error("PROJECT_ROOT environment variable not set")
            return

        # Get the tools directory path
        tools_dir = Path(project_root) / "tools"
        if not tools_dir.exists():
            logger.error(f"Tools directory does not exist: {tools_dir}")
            return

        logger.info(f"Discovering tool functions in: {tools_dir}")
        registered_tools = 0

        def _is_package_dir(path: Path) -> bool:
            """Check if a directory is a Python package (has __init__.py)."""
            return (path / "__init__.py").exists()

        def _register_tool_function_node(func: ToolFunction, category: str) -> None:
            """Register a tool function node in the NodeRegistry."""
            node_class = func.node_class
            category = "Custom Tools"
            if category not in cls._nodes:
                cls._nodes[category] = []

            node_info = NodeInfo(
                node_type_name=node_class.__name__,
                module=node_class.__module__,
                # Using dot notation for nested attribute
                class_name=f"{func.func_name}.node_class",
                subcategory=getattr(node_class, "subcategory", None),
            )

            if not any(n.node_type_name == node_class.__name__ for n in cls._nodes[category]):
                cls._nodes[category].append(node_info)
                nonlocal registered_tools
                registered_tools += 1
                logger.debug(
                    f"Registered tool function {node_class.__name__} in category {category}"
                )

        def _is_valid_tool_function(attr: Any) -> bool:
            """Check if an attribute is a properly decorated tool function."""
            if not isinstance(attr, ToolFunction):
                return False
            if not issubclass(attr.node_class, FunctionToolNode):
                return False  # Skip regular functions
            # Must have all required node attributes
            required_attrs = {"display_name", "config_model", "input_model", "output_model"}
            return all(hasattr(attr.node_class, attr_name) for attr_name in required_attrs)

        def _discover_tools_in_directory(path: Path, base_package: str = "tools") -> None:
            """Recursively discover tool functions in package directories."""
            # Skip if not a package directory
            if not _is_package_dir(path):
                return

            for item in path.iterdir():
                if item.is_file() and item.suffix == ".py" and not item.name.startswith("_"):
                    try:
                        # Get the module path relative to project root
                        module_path = f"{base_package}.{item.stem}"

                        # Import the module using standard import_module
                        module = importlib.import_module(module_path)

                        # Register any valid tool functions found in the module
                        for attr_name in dir(module):
                            attr = getattr(module, attr_name)
                            if _is_valid_tool_function(attr):
                                node_class = attr.node_class
                                category = getattr(node_class, "category", "Uncategorized")
                                _register_tool_function_node(attr, category)

                    except Exception as e:
                        logger.error(f"Failed to load module {item}: {e}")
                        logger.error(traceback.format_exc())

                # Recursively process subdirectories
                elif item.is_dir() and not item.name.startswith("_"):
                    # Update the base package for the subdirectory
                    subpackage = f"{base_package}.{item.name}"
                    _discover_tools_in_directory(item, subpackage)

        # Start recursive discovery from tools directory
        _discover_tools_in_directory(tools_dir)
        logger.info(f"Tool function discovery complete. Found {registered_tools} tool functions.")

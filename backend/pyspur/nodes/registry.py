# backend/app/nodes/registry.py
import importlib
import importlib.util
import os
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
                node_class.subcategory = subcategory  # type: ignore

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
        Works with both package (with __init__.py) and non-package Python files.
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

        def _get_module_path(file_path: Path, base_path: Path) -> str:
            """Get the appropriate module path for importing.

            For files in a package (directory with __init__.py), returns the full package path.
            For standalone files, returns the absolute file path.
            """
            try:
                rel_path = file_path.relative_to(base_path)
                parts = list(rel_path.parts)

                # Build the module path by checking each parent directory
                module_parts: List[str] = []
                current_path = base_path

                # Handle the directory parts
                for part in parts[:-1]:  # Exclude the file name
                    current_path = current_path / part
                    if _is_package_dir(current_path):
                        module_parts.append(part)
                    else:
                        # If we hit a non-package directory, we'll use absolute path
                        return str(file_path)

                # Add the file name without .py
                module_parts.append(parts[-1][:-3])  # Remove .py extension

                # If we have a valid package path, return it with dots
                if module_parts:
                    return ".".join(module_parts)

                # Fallback to absolute path
                return str(file_path)
            except Exception:
                # Fallback to absolute path if anything goes wrong
                return str(file_path)

        def _discover_tools_in_directory(path: Path) -> None:
            nonlocal registered_tools

            for item in path.iterdir():
                if item.is_file() and item.suffix == ".py" and not item.name.startswith("_"):
                    try:
                        # Get the appropriate module path/name
                        module_path = _get_module_path(item, tools_dir)

                        # Create a spec for the module
                        if module_path.endswith(".py"):
                            # For non-package files, use spec_from_file_location
                            spec = importlib.util.spec_from_file_location(item.stem, str(item))
                        else:
                            # For package files, use find_spec
                            spec = importlib.util.find_spec(module_path)

                        if spec is None or spec.loader is None:
                            logger.warning(f"Could not create module spec for {item}")
                            continue

                        # Create and execute the module
                        module = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(module)

                        # Look for tool functions in module attributes
                        for attr_name in dir(module):
                            attr = getattr(module, attr_name)
                            # Check if attribute has node_class (indicating it's a tool function)
                            if hasattr(attr, "node_class"):
                                node_class = attr.node_class
                                # Register the node class if it has a category
                                category = getattr(node_class, "category", "Uncategorized")
                                if category not in cls._nodes:
                                    cls._nodes[category] = []

                                # Create node registration info
                                node_info = {
                                    "node_type_name": node_class.__name__,
                                    "module": module_path,  # Use the full module path
                                    "class_name": node_class.__name__,
                                    "subcategory": getattr(node_class, "subcategory", None),
                                }

                                # Add to registry if not already present
                                if not any(
                                    n["node_type_name"] == node_class.__name__
                                    for n in cls._nodes[category]
                                ):
                                    cls._nodes[category].append(node_info)
                                    registered_tools += 1
                                    logger.debug(
                                        f"Registered tool function node {node_class.__name__}"
                                        f" from {module_path} in category {category}"
                                    )

                    except Exception as e:
                        logger.error(f"Failed to load module {item}: {e}")

                # Recursively process subdirectories
                elif item.is_dir() and not item.name.startswith("_"):
                    _discover_tools_in_directory(item)

        # Start recursive discovery
        _discover_tools_in_directory(tools_dir)
        logger.info(f"Tool function discovery complete. Found {registered_tools} tool functions.")

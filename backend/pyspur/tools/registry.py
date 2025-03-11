# registry.py
import logging
import os
import importlib
import pkgutil
import sys
from typing import Set, List, Dict, Any, Callable, TypeVar, ParamSpec, cast
from functools import wraps
import asyncio

P = ParamSpec("P")
R = TypeVar("R")
F = TypeVar("F", bound=Callable[..., Any])


class ToolRegistry:
    _registered_modules: Set[str] = set()
    _registered_tools: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def register(cls, description: str | None = None) -> Callable[[F], F]:
        """
        Decorator to register a tool function with metadata.

        Args:
            description: Optional description of what the tool does

        Returns:
            A decorator function that preserves the original function's type
        """

        def decorator(func: F) -> F:
            module_name = func.__module__
            if module_name not in cls._registered_modules:
                cls._registered_modules.add(module_name)
                logging.debug(f"Registered module {module_name}")

            tool_info = {
                "name": func.__name__,
                "description": description or func.__doc__ or "No description available",
                "module": module_name,
                "is_async": asyncio.iscoroutinefunction(func),
            }

            cls._registered_tools[func.__name__] = tool_info
            logging.debug(f"Registered tool {func.__name__}")

            @wraps(func)
            async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> Any:
                return await func(*args, **kwargs)

            @wraps(func)
            def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> Any:
                return func(*args, **kwargs)

            # Return the appropriate wrapper based on whether the function is async
            wrapper = async_wrapper if tool_info["is_async"] else sync_wrapper
            wrapper.__name__ = func.__name__  # Ensure the wrapper has the original function name
            return cast(F, wrapper)

        return decorator

    @classmethod
    def discover_and_load_tools(cls, package_path: str) -> None:
        """
        Discover and import all Python modules in the given package path.
        This will trigger the registration of any tools decorated with @register.

        Args:
            package_path: Path to the package containing tool modules
        """
        # Add the parent directory to sys.path so Python can find our package
        parent_dir = os.path.dirname(os.path.dirname(package_path))
        if parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)

        # Get the full package name (e.g., 'pyspur.tools')
        rel_path = os.path.relpath(package_path, parent_dir)
        package_name = rel_path.replace(os.sep, ".")

        # Walk through the package directory
        for _, name, is_pkg in pkgutil.iter_modules([package_path]):
            if not is_pkg and name not in ["server", "__init__"]:  # Skip server.py and __init__.py
                try:
                    full_module_name = f"{package_name}.{name}"
                    importlib.import_module(full_module_name)
                    logging.info(f"Successfully loaded tool module: {full_module_name}")
                except Exception as e:
                    logging.error(f"Failed to load tool module {name}: {e}")

    @classmethod
    def get_registered_modules(cls) -> List[str]:
        """Get list of all registered modules"""
        return sorted(list(cls._registered_modules))

    @classmethod
    def get_tool_info(cls, tool_name: str) -> Dict[str, Any] | None:
        """Get information about a specific tool"""
        return cls._registered_tools.get(tool_name)

    @classmethod
    def get_all_tools(cls) -> Dict[str, Dict[str, Any]]:
        """Get all registered tools"""
        return cls._registered_tools

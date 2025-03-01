import inspect
from typing import Any, Callable, Dict, Optional, Type, get_origin, get_type_hints

from pydantic import BaseModel

from ..utils import pydantic_utils
from .base import BaseNode, VisualTag


def node_function(
    name: Optional[str] = None,
    input_model: Optional[Type[BaseModel]] = None,
    output_model: Optional[Type[BaseModel]] = None,
    display_name: Optional[str] = None,
    category: Optional[str] = None,
    logo: Optional[str] = None,
    visual_tag: Optional[VisualTag] = None,
    has_fixed_output: bool = False,
) -> Callable[[Callable[..., Any]], Type[BaseNode]]:
    """Decorator to convert a function into a BaseNode.
    
    This decorator allows you to easily convert any function into a BaseNode
    without having to create a full class definition. It automatically handles
    input and output validation, and provides a consistent interface for
    working with nodes in the workflow system.
    
    Args:
        name: Name for the node (defaults to function name if not provided)
        input_model: Pydantic model for input validation (auto-generated from function signature if None)
        output_model: Pydantic model for output validation (inferred from return type annotation if possible)
        display_name: Display name for the node in UI
        category: Category for the node
        logo: Path to logo image
        visual_tag: Visual tag for the node
        has_fixed_output: Whether the output schema is fixed
        
    Returns:
        A decorator function that converts the decorated function into a BaseNode class
        
    Examples:
        >>> @node_function(category="Math")
        >>> def add_numbers(a: float, b: float) -> float:
        >>>     return a + b
        >>>
        >>> # Create an instance of the node
        >>> add_node = add_numbers()
        >>> result = await add_node({"a": 1, "b": 2})
        >>> print(result)  # Output will contain the value 3

    """
    def decorator(func: Callable[..., Any]) -> Type[BaseNode]:
        # Generate a name for the node class
        node_name: str = name or func.__name__
        node_class_name: str = f"{node_name.title().replace('_', '')}Node"

        # Create input model from function signature if not provided
        func_input_model = input_model
        if func_input_model is None:
            sig = inspect.signature(func)
            fields: Dict[str, Any] = {}
            for param_name, param in sig.parameters.items():
                if param_name == 'self' or param.kind == param.VAR_POSITIONAL or param.kind == param.VAR_KEYWORD:
                    continue
                annotation = param.annotation if param.annotation != inspect.Parameter.empty else Any
                default = param.default if param.default != inspect.Parameter.empty else ...
                fields[param_name] = (annotation, default)

            func_input_model = pydantic_utils.create_model(
                f"{node_class_name}Input",
                **fields,
                __base__=BaseModel
            )

        # Try to infer output model from return type annotation if not provided
        func_output_model = output_model
        if func_output_model is None:
            try:
                type_hints = get_type_hints(func)
                return_type = type_hints.get('return', None)

                # If return type is not specified or is None, create a generic output model
                if return_type is None or return_type == type(None):  # noqa
                    # Create an empty output model
                    func_output_model = pydantic_utils.create_model(
                        f"{node_class_name}Output",
                        __base__=BaseModel
                    )
                # Check if return type is a BaseModel subclass
                elif isinstance(return_type, type) and issubclass(return_type, BaseModel):
                    func_output_model = return_type
                # Check if return type is a dictionary type annotation
                elif get_origin(return_type) is dict:
                    # Create a dynamic output model that accepts any dictionary
                    func_output_model = pydantic_utils.create_model(
                        f"{node_class_name}Output",
                        __base__=BaseModel,
                        model_config={"extra": "allow"}
                    )
                else:
                    # For primitive return types, create a model with a single field named "value"
                    func_output_model = pydantic_utils.create_model(
                        f"{node_class_name}Output",
                        value=(return_type, ...),
                        __base__=BaseModel
                    )
            except (TypeError, AttributeError):
                # If we can't get type hints, use a generic output model
                func_output_model = pydantic_utils.create_model(
                    f"{node_class_name}Output",
                    __base__=BaseModel,
                    model_config={"extra": "allow"}
                )

        # Create the node class
        class FunctionNode(BaseNode):
            def __init__(self, **kwargs: Any) -> None:
                kwargs['name'] = node_name
                kwargs['input_model'] = func_input_model
                kwargs['output_model'] = func_output_model
                kwargs['has_fixed_output'] = has_fixed_output
                super().__init__(**kwargs)

                if display_name:
                    self.display_name = display_name
                else:
                    self.display_name = node_name.replace('_', ' ').title()

                if category:
                    self.category = category

                if logo:
                    self.logo = logo

                if visual_tag:
                    self.visual_tag = visual_tag

            async def run(self, input: BaseModel) -> BaseModel:
                # Convert input model to kwargs
                kwargs = input.model_dump()

                # Call the original function
                result = func(**kwargs)

                # Handle both synchronous and asynchronous functions
                if inspect.isawaitable(result):
                    result = await result

                # If result is already a BaseModel, return it
                if isinstance(result, BaseModel):
                    return result

                # If result is None, return an empty model
                if result is None:
                    return func_output_model()

                # If result is a dict, convert it to the output model
                if isinstance(result, dict):
                    try:
                        return func_output_model.model_validate(result)
                    except Exception:
                        # If validation fails, create a dynamic model with the result
                        dynamic_output = pydantic_utils.create_model(
                            "DynamicOutput",
                            __base__=BaseModel,
                            model_config={"extra": "allow"}
                        )
                        return dynamic_output.model_validate(result)

                # For primitive types, handle them directly
                try:
                    # Check if the output model has a single field named "value"
                    model_fields = func_output_model.model_fields
                    if len(model_fields) == 1 and "value" in model_fields:
                        # This is our special case for primitive types
                        return func_output_model(value=result)
                    else:
                        # Try to validate the result directly
                        return func_output_model.model_validate(result)
                except Exception:
                    # If all else fails, create a dynamic model based on the result type
                    field_name = type(result).__name__.lower()

                    # Create a model with a field named after the result type
                    field_dict: Dict[str, Any] = {field_name: (type(result), result)}
                    dynamic_model = pydantic_utils.create_model(
                        "DynamicOutput",
                        **field_dict,
                        __base__=BaseModel
                    )
                    return dynamic_model()

        # Set the class name and docstring
        FunctionNode.__name__ = node_class_name
        FunctionNode.__qualname__ = node_class_name
        FunctionNode.__doc__ = func.__doc__ or f"Node created from function {func.__name__}"

        return FunctionNode

    return decorator

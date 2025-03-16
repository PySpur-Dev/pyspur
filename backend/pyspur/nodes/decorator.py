import inspect
import json
from typing import (
    Any,
    Callable,
    Dict,
    Optional,
    Protocol,
    Set,
    Type,
    cast,
    get_type_hints,
    runtime_checkable,
)

from jinja2 import Template
from pydantic import BaseModel, Field, create_model

from pyspur.utils import pydantic_utils

from ..execution.workflow_execution_context import WorkflowExecutionContext
from .base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput, VisualTag


class FunctionToolNode(BaseNode):
    """Node class for function-based tools.

    This class is used to wrap Python functions as PySpur nodes. It handles parameter extraction,
    template rendering, and function execution.
    """

    name: str
    display_name: str
    config_model: Type[BaseNodeConfig]
    output_model: Type[BaseNodeOutput]
    input_model: Type[BaseNodeInput]
    function_param_names: Set[str]
    is_output_model_defined: bool
    _func: Callable[..., Any]
    _visual_tag: Optional[Dict[str, str]]

    def __init__(
        self,
        name: str,
        config: Optional[BaseNodeConfig] = None,
        context: Optional[WorkflowExecutionContext] = None,
        func: Optional[Callable[..., Any]] = None,
        visual_tag: Optional[Dict[str, str]] = None,
    ):
        # Create default config if none provided
        if config is None:
            config = self.config_model()

        # Call parent init first
        super().__init__(name=name, config=config, context=context)

        # Store the function and visual tag
        if func is not None:
            self._func = func
        if visual_tag:
            self.visual_tag = VisualTag(**visual_tag)
        self._visual_tag = visual_tag

    async def run(self, input: BaseModel) -> BaseModel:
        # Extract parameters from config directly using the stored parameter names
        # This is more efficient than checking sig.parameters each time
        kwargs: Dict[str, Any] = {}

        for param_name in self.function_param_names:
            if hasattr(self.config, param_name):
                kwargs[param_name] = getattr(self.config, param_name)

        # config values can be jinja2 templates so we need to render them
        for param_name, param_value in kwargs.items():
            if isinstance(param_value, str):
                template = Template(param_value)
                kwargs[param_name] = template.render(input=input)

        # Call the original function
        result = self._func(**kwargs)

        # Handle async functions
        if hasattr(result, "__await__"):
            result = await result

        if self.is_output_model_defined:
            return self.output_model.model_validate(result)
        else:
            return self.output_model.model_validate({"output": result})


@runtime_checkable
class ToolFunction(Protocol):
    """Protocol for functions decorated with @tool."""

    node_class: Type[BaseNode]
    config_model: Type[BaseNodeConfig]
    output_model: Type[BaseNodeOutput]
    func_name: str

    def create_node(
        self,
        name: str = ...,
        config: Optional[BaseNodeConfig] = None,
        context: Optional[WorkflowExecutionContext] = None,
    ) -> BaseNode: ...

    def __call__(self, *args: Any, **kwargs: Any) -> Any: ...


def tool_function(
    name: Optional[str] = None,
    display_name: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    visual_tag: Optional[Dict[str, str]] = None,
    has_fixed_output: bool = True,
    output_model: Optional[Type[BaseNodeOutput]] = None,
    **tool_config: Any,
) -> Callable[[Callable[..., Any]], ToolFunction]:
    """Register a function as a Tool.

    Args:
        name: Optional name for the tool (defaults to function name)
        display_name: Optional display name for the UI
        description: Optional description (defaults to function docstring)
        category: Optional category for organizing tools in the UI
        visual_tag: Optional visual styling for the UI
        has_fixed_output: Whether the tool has fixed output schema
        output_model: Optional custom output model to use instead of generating one
        **tool_config: Additional configuration parameters for the tool

    Returns:
        Decorated function that can still be called normally

    """

    def decorator(func: Callable[..., Any]) -> ToolFunction:
        # Get function metadata
        func_name = name or func.__name__
        func_display_name = display_name or func_name.replace("_", " ").title()
        func_doc = description or func.__doc__ or ""

        # Get type hints for input/output
        type_hints = get_type_hints(func)
        return_type = type_hints.get("return", Any)

        # Get function signature for default values
        sig = inspect.signature(func)

        # Create a simple input model - inputs will be determined by workflow position
        input_model: Type[BaseNodeInput] = create_model(
            f"{func_name}Input",
            __base__=BaseNodeInput,
            __module__=func.__module__,
            __validators__={},
            __cls_kwargs__={},
            __config__=None,
            __doc__=f"Input model for {func_name}",
        )

        is_output_model_defined: bool = False
        # Use provided output_model if available, otherwise create one
        if output_model is not None:
            # Use the provided output model
            _output_model = output_model
            is_output_model_defined = True
        else:
            # Create output model from function signature
            if isinstance(return_type, type) and issubclass(return_type, BaseNodeOutput):
                # If return type is already a Pydantic model, use it as base
                _output_model = return_type
                is_output_model_defined = True
            elif isinstance(return_type, type) and issubclass(return_type, BaseModel):
                _output_model = pydantic_utils.json_schema_to_model(
                    json_schema=return_type.model_json_schema(),
                    model_class_name=f"{func_name}",
                    base_class=BaseNodeOutput,
                )
                is_output_model_defined = True
            else:
                # For primitive return types, create a model with a single field named "value"
                _output_model = create_model(
                    f"{func_name}",
                    output=(return_type, ...),
                    __base__=BaseNodeOutput,
                    __module__=func.__module__,
                    __validators__={},
                    __cls_kwargs__={},
                    __config__=None,
                    __doc__=f"Output model for {func_name}",
                )

        # Determine if the function is a method, class method, or static/regular method
        is_method = False
        is_class_method = False

        # Check if the function is a method by looking at the first parameter
        if sig.parameters and list(sig.parameters.keys())[0] in ("self", "cls"):
            first_param = list(sig.parameters.keys())[0]
            is_method = first_param == "self"
            is_class_method = first_param == "cls"

        # Create config fields from function parameters
        function_param_fields: Dict[str, Any] = {}
        # Keep track of function parameter names for later use
        function_param_names: Set[str] = set()

        for param_name, param in sig.parameters.items():
            # Skip self for instance methods and cls for class methods
            # These will be handled specially during execution
            if (is_method and param_name == "self") or (is_class_method and param_name == "cls"):
                continue

            param_type = type_hints.get(param_name, Any)
            default = ... if param.default is inspect.Parameter.empty else param.default

            # Add parameter as a config field
            function_param_fields[param_name] = (
                param_type,
                Field(
                    default=default if default is not ... else None,
                    description=f"Parameter '{param_name}' for function {func_name}",
                ),
            )
            function_param_names.add(param_name)

        # Add other config fields
        decorator_param_fields: Dict[str, Any] = {k: (type(v), v) for k, v in tool_config.items()}

        # Merge function and decorator config fields, decorator fields take precedence
        # This allows the decorator to override function parameters if needed
        config_fields = {**function_param_fields, **decorator_param_fields}

        # Create the config model
        config_model: Type[BaseNodeConfig] = create_model(
            f"{func_name}Config",
            output_json_schema=(str, json.dumps(_output_model.model_json_schema())),
            has_fixed_output=(bool, has_fixed_output),
            **config_fields,
            __base__=BaseNodeConfig,
            __module__=func.__module__,
            __validators__={},
            __cls_kwargs__={},
            __config__=None,
            __doc__=f"Config model for {func_name}",
        )

        # Store these for use in the class definition
        nonlocal category
        _category = category
        _config_model = config_model
        _input_model = input_model
        _function_param_names = function_param_names
        _is_output_model_defined = is_output_model_defined

        # Create a Node class for this function
        class CustomFunctionToolNode(FunctionToolNode):
            name = func_name
            display_name = func_display_name
            category = _category or "FunctionTools"
            config_model = _config_model
            output_model = _output_model  # type: ignore
            input_model = _input_model
            function_param_names = _function_param_names
            is_output_model_defined = _is_output_model_defined
            __doc__ = func_doc

            def __init__(
                self,
                name: str = func_name,
                config: Optional[BaseNodeConfig] = None,
                context: Optional[WorkflowExecutionContext] = None,
            ):
                super().__init__(
                    name=name,
                    config=config,
                    context=context,
                    func=func,
                    visual_tag=visual_tag,
                )

        # Change the name of the class to the function name and bind it to the module
        new_class_name = type(
            f"{func_name}",
            (CustomFunctionToolNode,),
            {
                "__module__": func.__module__  # Set the module to match the decorated func's module
            },
        )

        # Set NodeClass attribute to the function
        func.node_class = new_class_name  # type: ignore

        # Set the config model to the config_model
        func.config_model = config_model  # type: ignore

        # Set the output model to the output_model
        func.output_model = _output_model  # type: ignore

        # Set the func_name attribute to the function name
        func.func_name = func.__name__  # type: ignore

        # Set the create_node function to the func
        def create_node(
            name: str = func_name,
            config: Optional[BaseNodeConfig] = None,
            context: Optional[WorkflowExecutionContext] = None,
        ) -> FunctionToolNode:
            return new_class_name(name=name, config=config, context=context)

        func.create_node = create_node  # type: ignore

        return cast(ToolFunction, func)

    return decorator


if __name__ == "__main__":
    import asyncio

    from pydantic import Field

    # Example usage
    @tool_function(name="example_tool", description="An example tool", category="Example")
    def example_function(param1: str, param2: int = 42) -> Dict[str, Any]:
        """Return a dictionary."""
        return {"param1": param1, "param2": param2}

    # Create a node from the function
    node_config = example_function.config_model.model_validate(
        {"param1": "test", "param2": 100, "has_fixed_output": True}
    )
    node = example_function.create_node(name="example_node", config=node_config)
    print("=" * 50)
    print("PLAIN FUNCTION EXECUTION:")
    print(example_function("test", 100))  # Output: {'param1': 'test', 'param2': 100}

    print("=" * 50)
    print("NODE NAME:")
    print(node.name)  # Output: example_tool

    print("=" * 50)
    print("DISPLAY NAME:")
    print(node.display_name)  # Output: Example Tool

    print("=" * 50)
    print("CATEGORY:")
    print(node.category)  # Output: Example

    print("=" * 50)
    print("CONFIG MODEL SCHEMA:")
    print(node.config_model.model_json_schema())  # Output: JSON schema of the config model

    print("=" * 50)
    print("OUTPUT MODEL SCHEMA:")
    print(node.output_model.model_json_schema())  # Output: JSON schema of the output model

    print("=" * 50)
    print("NODE EXECUTION RESULT:")
    print(asyncio.run(node(input={"input_data": "test"})))  # Output: Result of the function

    # Example with custom config_model and output_model
    print("\n" + "=" * 50)
    print("EXAMPLE WITH CUSTOM OUTPUT MODEL:")

    # Define custom output model
    class CustomOutputModel(BaseNodeOutput):
        result: str = Field(..., description="The result of the operation")
        status: str = Field("success", description="Status of the operation")

    # Function that will use custom output model
    @tool_function(
        name="custom_model_tool",
        description="Tool with custom output model",
        category="Example",
        output_model=CustomOutputModel,
    )
    def custom_model_function(message: str, prefix: str = "Result: ") -> Dict[str, str]:
        """Use custom output model."""
        return {"result": f"{prefix}{message}", "status": "success"}

    # Create a node from the function with custom output model
    custom_config = custom_model_function.config_model.model_validate(
        {"message": "Hello World", "prefix": "Custom: ", "has_fixed_output": True}
    )
    custom_node = custom_model_function.create_node(name="custom_node", config=custom_config)

    print("CUSTOM NODE CONFIG MODEL:")
    print(custom_node.config_model.model_json_schema())

    print("\nCUSTOM NODE OUTPUT MODEL:")
    print(custom_node.output_model.model_json_schema())

    print("\nCUSTOM NODE EXECUTION RESULT:")
    print(asyncio.run(custom_node(input={})))

    # Example with jinja2 template in config rendered using input
    print("\n" + "=" * 50)
    print("EXAMPLE WITH JINJA2 TEMPLATE IN CONFIG:")

    @tool_function(
        name="jinja_tool",
        description="Tool with jinja2 template in config rendered using input",
        category="Example",
    )
    def jinja_function(template: str, suffix: str = "World") -> str:
        """Use jinja2 template in config."""
        return template + suffix

    # Create a node from the function with jinja2 template in config
    jinja_config = jinja_function.config_model.model_validate(
        {"template": "Hello ", "suffix": "{{ input.input_data }}", "has_fixed_output": True}
    )
    jinja_node = jinja_function.create_node(name="jinja_node", config=jinja_config)
    # Render the template using input
    input_data: Dict[str, Any] = {"input_data": "Jinja2!"}

    jinja_result = asyncio.run(jinja_node(input=input_data))
    print("JINJA NODE CONFIG MODEL:")
    print(jinja_node.config_model.model_json_schema())

    print("\nJINJA NODE OUTPUT MODEL:")
    print(jinja_node.output_model.model_json_schema())

    print("\nJINJA NODE EXECUTION RESULT:")
    print(jinja_result)  # Output: Hello Jinja2!

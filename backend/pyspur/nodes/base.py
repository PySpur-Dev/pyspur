import json
from abc import ABC, ABCMeta, abstractmethod
from hashlib import md5
from typing import Any, Callable, Dict, ForwardRef, List, Optional, Tuple, Type, cast

from pydantic import BaseModel, Field, create_model

from ..execution.workflow_execution_context import WorkflowExecutionContext
from ..schemas.workflow_schemas import WorkflowDefinitionSchema
from ..utils import pydantic_utils

BaseNodeType = ForwardRef('BaseNode')


class NodeMetaclass(ABCMeta):
    """Metaclass that automatically adds config initialization to BaseNode subclasses."""

    def __new__(cls, name: str,
                bases: Tuple[Type[Any], ...],
                namespace: Dict[str, Any]
                ) -> Type[Any]:
        created_cls = super().__new__(cls, name, bases, namespace)

        if name != 'BaseNode' and hasattr(created_cls, 'config_model'):
            # Get config model type with explicit cast
            config_model = cast(Type[BaseModel], created_cls.config_model) # type: ignore
            original_init = created_cls.__init__  # type: ignore # Known to match BaseNode.__init__ signature

            def new_init(self: BaseNode,
                         name: str,
                         context: Optional[WorkflowExecutionContext] = None,
                         config: Optional[BaseNodeConfig] = None,
                         **kwargs: Any
                         ) -> None:
                # Extract config fields from the config model
                config_fields = config_model.model_fields

                # Split kwargs into config kwargs and other kwargs
                if config is None:
                    # Only process config from kwargs if no config was passed directly
                    config_kwargs = {k: v for k, v in kwargs.items() if k in config_fields}
                    other_kwargs = {k: v for k, v in kwargs.items() if k not in config_fields}

                    # Create config instance
                    config_instance = config_model(**config_kwargs)
                    # Convert to BaseNodeConfig if needed
                    if isinstance(config_instance, BaseNodeConfig):
                        config = config_instance
                    else:
                        config = BaseNodeConfig(**config_instance.model_dump()) if config_kwargs else None
                else:
                    # If config was passed, don't process any config kwargs
                    other_kwargs = kwargs

                # Call original init with the config
                cast(
                    Callable[..., None],  # type that matches any function signature returning None
                    original_init
                )(self, name=name, config=config, context=context, **other_kwargs)

            # Replace the original __init__ using object's __setattr__ to bypass type checking
            new_init.__wrapped__ = original_init  # type: ignore
            object.__setattr__(cls, '__init__', new_init)

        return cls


class VisualTag(BaseModel):
    """Pydantic model for visual tag properties."""

    acronym: str = Field(...)
    color: str = Field(
        ..., pattern=r"^#(?:[0-9a-fA-F]{3}){1,2}$"
    )  # Hex color code validation using regex


class BaseNodeConfig(BaseModel):
    """Base class for node configuration models.

    Each node must define its output_schema.
    """

    output_schema: Dict[str, str] = Field(
        default={"output": "string"},
        title="Output schema",
        description="The schema for the output of the node",
    )
    output_json_schema: str = Field(
        default='{"type": "object", "properties": {"output": {"type": "string"} } }',
        title="Output JSON schema",
        description="The JSON schema for the output of the node",
    )
    has_fixed_output: bool = Field(
        default=False,
        description="Whether the node has a fixed output schema defined in config",
    )


class BaseNodeOutput(BaseModel):
    """Base class for all node outputs.

    Each node type will define its own output model that inherits from this.
    """

    pass


class BaseNodeInput(BaseModel):
    """Base class for node inputs.

    Each node's input model will be dynamically created based on its predecessor nodes,
    with fields named after node IDs and types being the corresponding NodeOutputModels.
    """

    pass


class BaseNode(ABC, metaclass=NodeMetaclass):
    """Base class for all nodes.

    Each node receives inputs as a Pydantic model where:
    - Field names are predecessor node IDs
    - Field types are the corresponding NodeOutputModels
    
    Configuration parameters defined in the node's config_model can be passed directly to __init__:
    >>> node = MyNode(name="my_node", my_config_param=42)
    
    Or using a config instance:
    >>> config = MyNodeConfig(my_config_param=42)
    >>> node = MyNode(name="my_node", config=config)
    """

    name: str
    display_name: str = ""  # Will be used for config title, defaults to class name if not set
    logo: Optional[str] = None
    category: Optional[str] = None
    config_model: Type[BaseModel]
    output_model: Type[BaseNodeOutput]
    input_model: Type[BaseNodeInput]
    _config: BaseNodeConfig
    _input: BaseNodeInput
    _output: BaseNodeOutput
    visual_tag: VisualTag
    subworkflow: Optional[WorkflowDefinitionSchema]
    subworkflow_output: Optional[Dict[str, Any]]

    def __init__(
        self,
        name: str,
        config: Optional[BaseNodeConfig] = None,
        context: Optional[WorkflowExecutionContext] = None,
        **kwargs: Any,
    ) -> None:
        self.name = name
        self.context = context

        # Handle config initialization
        if config is not None:
            self._config = config
        else:
            # Filter out name and context from kwargs if present
            config_kwargs = {k: v for k, v in kwargs.items() if k not in ['name', 'context']}
            # Create config instance from remaining kwargs if any, otherwise use default
            if config_kwargs:
                config_data = self.config_model(**config_kwargs).model_dump()
                self._config = BaseNodeConfig(**config_data)
            else:
                self._config = BaseNodeConfig()

        self.subworkflow = None
        self.subworkflow_output = None
        if not hasattr(self, "visual_tag"):
            self.visual_tag = self.get_default_visual_tag()
        self.setup()

    def setup(self) -> None:
        """Define output_model and any other initialization.

        For dynamic schema nodes, these can be created based on self.config.
        """
        if self._config.has_fixed_output:
            schema = json.loads(self._config.output_json_schema)
            model = pydantic_utils.json_schema_to_model(
                schema, model_class_name=self.name, base_class=BaseNodeOutput
            )
            self.output_model = model  # type: ignore

    def create_output_model_class(self, output_schema: Dict[str, str]) -> Type[BaseNodeOutput]:
        """Dynamically creates an output model based on the node's output schema."""
        field_type_to_python_type = {
            "string": str,
            "str": str,
            "integer": int,
            "int": int,
            "number": float,
            "float": float,
            "boolean": bool,
            "bool": bool,
            "list": list,
            "dict": dict,
            "array": list,
            "object": dict,
        }
        return create_model(
            f"{self.name}",
            **{
                field_name: (
                    (field_type_to_python_type[field_type], ...)
                    if field_type in field_type_to_python_type
                    else (field_type, ...)  # try as is
                )
                for field_name, field_type in output_schema.items()
            },
            __base__=BaseNodeOutput,
            __config__=None,
            __doc__=f"Output model for {self.name} node",
            __module__=self.__module__,
            __validators__=None,
            __cls_kwargs__=None,
        )

    def create_composite_model_instance(
        self, model_name: str, instances: List[BaseModel]
    ) -> Type[BaseNodeInput]:
        """Create a new Pydantic model that combines all the given models based on their instances.

        Args:
            model_name: The name of the new model.
            instances: A list of Pydantic model instances.

        Returns:
            A new Pydantic model with fields named after the class names of the instances.

        """
        # Create the new model class
        return create_model(
            model_name,
            **{instance.__class__.__name__: (instance.__class__, ...) for instance in instances},
            __base__=BaseNodeInput,
            __config__=None,
            __doc__=f"Input model for {self.name} node",
            __module__=self.__module__,
            __validators__=None,
            __cls_kwargs__=None,
        )

    async def __call__(
        self,
        input: (
            Dict[str, str | int | bool | float | Dict[str, Any] | List[Any]]
            | Dict[str, BaseNodeOutput]
            | Dict[str, BaseNodeInput]
            | BaseNodeInput
        ),
    ) -> BaseNodeOutput:
        """Validate inputs and runs the node's logic.

        Args:
            input: Pydantic model containing predecessor outputs
            or a dictionary of node_id : NodeOutputModels

        Returns:
            The node's output model

        """
        if isinstance(input, dict):
            if all(isinstance(value, BaseNodeOutput) for value in input.values()) or all(
                isinstance(value, BaseNodeInput) for value in input.values()
            ):
                # Input is a dictionary of BaseNodeOutput instances, creating a composite model
                self.input_model = self.create_composite_model_instance(
                    model_name=self.input_model.__name__,
                    instances=list(input.values()),  # type: ignore we already checked that all values are BaseNodeOutput instances
                )
                data = {  # type: ignore
                    instance.__class__.__name__: instance.model_dump()  # type: ignore
                    for instance in input.values()
                }
                input = self.input_model.model_validate(data)
            else:
                # Input is not a dictionary of BaseNodeOutput instances, validating as BaseNodeInput
                input = self.input_model.model_validate(input)

        self._input = input
        result = await self.run(input)

        try:
            output_validated = self.output_model.model_validate(result.model_dump())
        except AttributeError:
            output_validated = self.output_model.model_validate(result)
        except Exception as e:
            raise ValueError(f"Output validation error in {self.name}: {e}") from e

        self._output = output_validated
        return output_validated

    @abstractmethod
    async def run(self, input: BaseModel) -> BaseModel:
        """Abstract method where the node's core logic is implemented.

        Args:
            input: Pydantic model containing predecessor outputs

        Returns:
            An instance compatible with output_model

        """
        pass

    @property
    def config(self) -> Any:
        """Return the node's configuration."""
        return self.config_model.model_validate(self._config.model_dump())

    def update_config(self, config: BaseNodeConfig) -> None:
        """Update the node's configuration."""
        self._config = config

    @property
    def input(self) -> Any:
        """Return the node's input."""
        return self.input_model.model_validate(self._input.model_dump())

    @property
    def output(self) -> Any:
        """Return the node's output."""
        return self.output_model.model_validate(self._output.model_dump())

    @classmethod
    def get_default_visual_tag(cls) -> VisualTag:
        """Set a default visual tag for the node."""
        # default acronym is the first letter of each word in the node name
        acronym = "".join([word[0] for word in cls.name.split("_")]).upper()

        # default color is randomly picked from a list of pastel colors
        colors = [
            "#007BFF",  # Electric Blue
            "#28A745",  # Emerald Green
            "#FFC107",  # Sunflower Yellow
            "#DC3545",  # Crimson Red
            "#6F42C1",  # Royal Purple
            "#FD7E14",  # Bright Orange
            "#20C997",  # Teal
            "#E83E8C",  # Hot Pink
            "#17A2B8",  # Cyan
            "#6610F2",  # Indigo
            "#8CC63F",  # Lime Green
            "#FF00FF",  # Magenta
            "#FFD700",  # Gold
            "#FF7F50",  # Coral
            "#40E0D0",  # Turquoise
            "#00BFFF",  # Deep Sky Blue
            "#FF5522",  # Orange
            "#FA8072",  # Salmon
            "#8A2BE2",  # Violet
        ]
        color = colors[int(md5(cls.__name__.encode()).hexdigest(), 16) % len(colors)]

        return VisualTag(acronym=acronym, color=color)

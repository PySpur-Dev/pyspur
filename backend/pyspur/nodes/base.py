import json
from abc import ABC, abstractmethod
from hashlib import md5
from typing import Any, Dict, List, Optional, Type, cast

from pydantic import BaseModel, Field, create_model

from ..execution.workflow_execution_context import WorkflowExecutionContext
from ..schemas.workflow_schemas import WorkflowDefinitionSchema
from ..utils import pydantic_utils


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
    model_config = {
        "extra": "allow",
    }


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


class BaseNode(ABC):
    """Base class for all nodes.

    Each node receives inputs as a Pydantic model where:
    - Field names are predecessor node IDs
    - Field types are the corresponding NodeOutputModels
    """

    name: str = ""
    display_name: str = ""
    category: Optional[str] = None
    subcategory: Optional[str] = None
    logo: Optional[str] = None
    config_model: Type[BaseNodeConfig]
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
        config: BaseNodeConfig,
        context: Optional[WorkflowExecutionContext] = None,
    ) -> None:
        self.name = name
        self._config = config
        self.context = context
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
        self, model_name: str, instances: Dict[str, BaseModel]
    ) -> Type[BaseNodeInput]:
        """Create a new Pydantic model that combines all the given models based on their instances.

        Args:
            model_name: The name of the new model.
            instances: A dictionary of Pydantic model instances.

        Returns:
            A new Pydantic model with fields named after the keys of the dictionary.

        """
        # Create the new model class
        return create_model(
            model_name,
            **{key: (instance.__class__, ...) for key, instance in instances.items()},
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
        """Validate inputs and run the node's logic.

        Args:
            input: Pydantic model containing predecessor
                outputs or a Dict[str<predecessor node name>, NodeOutputModel]

        Returns:
            The node's output model

        """
        if isinstance(input, dict):
            if all(isinstance(value, BaseNodeOutput) for value in input.values()) or all(
                isinstance(value, BaseNodeInput) for value in input.values()
            ):
                # Input is a dictionary of BaseNodeOutput or BaseNodeInput instances,
                # creating a composite model
                composite_inputs: Dict[str, BaseModel] = cast(Dict[str, BaseModel], input)
                self.input_model = self.create_composite_model_instance(
                    model_name=self.input_model.__name__,
                    instances=composite_inputs,  # preserve original keys
                )
                data: Dict[str, Any] = {}
                for key, value in composite_inputs.items():
                    data[key] = value.model_dump()
                input = self.input_model.model_validate(data)
            else:
                # Input is a dictionary of primitive types
                self.input_model = pydantic_utils.create_model(
                    f"{self.name}Input",
                    **{field_name: (type(value), value) for field_name, value in input.items()},
                    __base__=BaseNodeInput,
                    __config__=None,
                    __doc__=f"Input model for {self.name} node",
                    __module__=self.__module__,
                    __validators__=None,
                    __cls_kwargs__=None,
                )
                input = self.input_model.model_validate(input)

        self._input = input
        result = await self.run(input)

        try:
            output_validated = self.output_model.model_validate(result.model_dump())
        except AttributeError:
            output_validated = self.output_model.model_validate(result)
        except Exception as e:
            # Print the result for better debuggability
            try:
                result_dump = result.model_dump() if hasattr(result, "model_dump") else result
                print(f"Validation failed for node {self.name}. Result: {result_dump}")
            except Exception as dump_error:
                print(
                    f"Validation failed for node {self.name}. Could not dump result: {dump_error}"
                )
                print(f"Result type: {type(result)}")
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

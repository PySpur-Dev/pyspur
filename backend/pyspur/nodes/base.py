import json
from abc import ABC, abstractmethod
from hashlib import md5
from typing import Any, Dict, Optional, Type, TypeVar, Union

from pydantic import BaseModel, Field, PrivateAttr

from ..execution.workflow_execution_context import WorkflowExecutionContext
from ..schemas.workflow_schemas import WorkflowDefinitionSchema
from ..utils import pydantic_utils

# Define TypeVar for BaseNode reference
T = TypeVar('T', bound='BaseNode')

class VisualTag(BaseModel):
    """Pydantic model for visual tag properties."""

    acronym: str = Field(...)
    color: str = Field(
        ..., pattern=r"^#(?:[0-9a-fA-F]{3}){1,2}$"
    )  # Hex color code validation using regex


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


# Define a type for the input parameter of __call__
NodeInputType = Union[
    Dict[str, Any],
    Dict[str, BaseModel],
    BaseModel
]


class BaseNode(BaseModel, ABC):
    """Base class for all nodes.

    Each node receives inputs as a Pydantic model and produces outputs as a Pydantic model.
    Subclasses can define their own input and output model types:

    >>> class MyNode(BaseNode):
    >>>     my_config_param: int = 42
    >>>     async def run(self, input: BaseModel) -> BaseModel:
    >>>         return MyOutputModel(...)

    You can define the output schema using either a JSON schema string or a Pydantic model:

    Using JSON schema string:
    >>> class MyNode(BaseNode):
    >>>     output_json_schema = '{"type": "object", "properties": {"result": {"type": "string"}}}'
    >>>     async def run(self, input: BaseModel) -> BaseModel:
    >>>         # ...

    Using Pydantic model (preferred for better developer experience):
    >>> class MyOutputModel(BaseModel):
    >>>     result: str
    >>>
    >>> class MyNode(BaseNode):
    >>>     output_json_schema = MyOutputModel
    >>>     async def run(self, input: BaseModel) -> BaseModel:
    >>>         return MyOutputModel(result="some result")

    Required parameters for all nodes:
    - name: Unique identifier for the node
    - output_json_schema: Define using either a JSON schema string or a Pydantic model class
    - has_fixed_output: If True, output schema cannot be modified at runtime
    """

    # Node configuration parameters
    name: str = Field(description="Unique identifier for the node")
    input_model: Union[str, Type[BaseModel]] = Field(
        default='{"type": "object", "properties": {} }',
        description="Defines the structure of node's input using either a JSON schema string or a Pydantic model class"
    )
    output_model: Union[str, Type[BaseModel]] = Field(
        default='{"type": "object", "properties": {"output": {"type": "string"} } }',
        description="Defines the structure of node's output using either a JSON schema string or a Pydantic model class"
    )
    has_fixed_output: bool = Field(
        default=False,
        description="If True, output schema cannot be modified at runtime"
    )

    # Internal properties (not exposed to users)
    _context: Optional[WorkflowExecutionContext] = PrivateAttr(default=None)
    # Will be used for config title, defaults to class name if not set
    _display_name: str = PrivateAttr(default="")
    _logo: Optional[str] = PrivateAttr(default=None)
    _category: Optional[str] = PrivateAttr(default=None)

    _input_data: Optional[BaseModel] = PrivateAttr(default=None)
    _output_data: Optional[BaseModel] = PrivateAttr(default=None)
    _visual_tag: Optional[VisualTag] = PrivateAttr(default=None)
    _subworkflow: Optional[WorkflowDefinitionSchema] = PrivateAttr(default=None)
    _subworkflow_output: Optional[Dict[str, Any]] = PrivateAttr(default=None)

    model_config = {
        "arbitrary_types_allowed": True,
        "extra": "allow",  # Allow extra fields for flexibility
    }

    def model_post_init(self, _: Any) -> None:
        """Initialize internal properties after Pydantic model initialization.

        This is called automatically by Pydantic after the model is initialized.
        It extracts internal properties from the extra fields and sets them as private attributes.

        Internal properties that can be set:
        - context: The workflow execution context
        - display_name: The display name for the node (used in UI)
        - logo: Path to the node's logo
        - category: The category the node belongs to

        It also initializes default input and output models if not set by subclasses.
        """
        # Extract and set internal properties if provided in model_extra
        # Get model_extra from Pydantic v2
        model_extra = getattr(self, "model_extra", {}) or {}

        self._context = model_extra.pop('context', None)

        if self._visual_tag is None:
            self._visual_tag = self.get_default_visual_tag()

        # Store the JSON schema representation for serialization purposes
        try:
            if isinstance(self.input_model, str):
                self._input_model = pydantic_utils.json_schema_to_model(
                    json_schema=json.loads(self.input_model),
                    base_class=BaseModel,
                    model_class_name=self.name + "InputModel",
                )
            else:
                self._input_model = self.input_model
            if isinstance(self.output_model, str):
                self._output_model = pydantic_utils.json_schema_to_model(
                    json_schema=json.loads(self.output_model),
                    base_class=BaseModel,
                    model_class_name=self.name,
                )
            else:
                self._output_model = self.output_model

        except Exception as e:
            raise ValueError(f"Invalid JSON schema for {self.name}: {e}") from e

        self.setup()

    def setup(self) -> None:
        """Define output_model and any other initialization.

        For dynamic schema nodes, these can be created based on the node's configuration.
        """
        pass

    async def __call__(
        self,
        input: NodeInputType,
    ) -> BaseModel:
        """Validate inputs and runs the node's logic.

        Args:
            input: Pydantic model or dictionary containing inputs

        Returns:
            The node's output model

        """
        validated_input: BaseModel

        if isinstance(input, dict):
            if all(isinstance(value, BaseModel) for value in input.values()):
                # Input is a dictionary of BaseModel instances
                model_instances = [v for v in input.values() if isinstance(v, BaseModel)]

                # Create a new input model based on these instances
                input_model_name = getattr(self._input_model, "__name__", "DynamicInputModel")
                new_input_model = pydantic_utils.create_composite_model_instance(
                    model_name=input_model_name,
                    instances=model_instances,
                    base_class=BaseModel,
                )
                self._input_model = new_input_model

                # Create data for validation
                data = {}
                for _, instance in input.items():
                    if isinstance(instance, BaseModel):
                        data[instance.__class__.__name__] = instance.model_dump()

                validated_input = self._input_model.model_validate(data)
            else:
                # Input is a dictionary of primitive values
                validated_input = self._input_model.model_validate(input)
        else:
            # Input is already a BaseModel instance
            validated_input = input

        # Store the validated input
        self._input_data = validated_input

        # Run the node's logic
        result = await self.run(validated_input)

        try:
            output_validated = self._output_model.model_validate(result.model_dump())
        except AttributeError:
            output_validated = self._output_model.model_validate(result)
        except Exception as e:
            raise ValueError(f"Output validation error in {self.name}: {e}") from e

        # Store the validated output
        self._output_data = output_validated
        return output_validated

    @abstractmethod
    async def run(self, input: BaseModel) -> BaseModel:
        """Abstract method where the node's core logic is implemented.

        Args:
            input: Validated input model

        Returns:
            An instance compatible with output_model

        """
        pass

    # Property getters for internal attributes
    @property
    def context(self) -> Optional[WorkflowExecutionContext]:
        """Return the node's execution context."""
        return self._context

    @property
    def display_name(self) -> str:
        """Return the node's display name."""
        return self._display_name

    @display_name.setter
    def display_name(self, value: str) -> None:
        """Set the node's display name."""
        self._display_name = value

    @property
    def logo(self) -> Optional[str]:
        """Return the node's logo."""
        return self._logo

    @logo.setter
    def logo(self, value: Optional[str]) -> None:
        """Set the node's logo."""
        self._logo = value

    @property
    def category(self) -> Optional[str]:
        """Return the node's category."""
        return self._category

    @category.setter
    def category(self, value: Optional[str]) -> None:
        """Set the node's category."""
        self._category = value

    @property
    def config_model(self) -> Type["BaseNode"]:
        """Return the node's config model."""
        return self.__class__

    @property
    def config(self) -> "BaseNode":
        """Return the node's config."""
        return self

    @property
    def input(self) -> Optional[BaseModel]:
        """Return the node's input."""
        if self._input_data is None:
            return None
        return self._input_model.model_validate(self._input_data.model_dump())

    @property
    def output(self) -> Optional[BaseModel]:
        """Return the node's output."""
        if self._output_data is None:
            return None
        return self._output_model.model_validate(self._output_data.model_dump())

    @property
    def visual_tag(self) -> Optional[VisualTag]:
        """Return the node's visual tag."""
        return self._visual_tag

    @visual_tag.setter
    def visual_tag(self, value: VisualTag) -> None:
        """Set the node's visual tag."""
        self._visual_tag = value

    @property
    def subworkflow(self) -> Optional[WorkflowDefinitionSchema]:
        """Return the node's subworkflow."""
        return self._subworkflow

    @subworkflow.setter
    def subworkflow(self, value: Optional[WorkflowDefinitionSchema]) -> None:
        """Set the node's subworkflow."""
        self._subworkflow = value

    @property
    def subworkflow_output(self) -> Optional[Dict[str, Any]]:
        """Return the node's subworkflow output."""
        return self._subworkflow_output

    @subworkflow_output.setter
    def subworkflow_output(self, value: Optional[Dict[str, Any]]) -> None:
        """Set the node's subworkflow output."""
        self._subworkflow_output = value

    @classmethod
    def get_default_visual_tag(cls) -> VisualTag:
        """Set a default visual tag for the node."""
        # default acronym is the first letter of each word in the node name
        acronym = "".join([word[0] for word in cls.__name__.split("_")]).upper()

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

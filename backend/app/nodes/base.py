from abc import ABC, abstractmethod
from hashlib import md5
from typing import Any, Dict, List, Tuple, Type, Union

from jinja2 import Template
from pydantic import BaseModel, Field, ValidationError, create_model

DynamicSchemaValueType = str
TSchemaValue = Type[
    Union[int, float, str, bool, List[Any], Dict[Any, Any], Tuple[Any, ...]]
]


class VisualTag(BaseModel):
    """
    Pydantic model for visual tag properties.
    """

    acronym: str = Field(...)
    color: str = Field(
        ..., pattern=r"^#(?:[0-9a-fA-F]{3}){1,2}$"
    )  # Hex color code validation using regex


class BaseNode(ABC):
    """
    Base class for all nodes.
    """

    name: str

    config_model: Type[BaseModel]
    input_model: Type[BaseModel]
    output_model: Type[BaseModel]

    _config: Any
    visual_tag: VisualTag

    def __init__(self, config: Any) -> None:
        self._config = config
        # if visual tag is not set by the node, set a default visual tag
        if not hasattr(self, "visual_tag"):
            self.visual_tag = self.get_default_visual_tag()
        self.setup()

    @abstractmethod
    def setup(self) -> None:
        """
        Setup method to define `config_model`, `input_model`, and `output_model`.
        For dynamic schemas, these can be created based on `self.config`.
        """

    async def __call__(self, input_data: Any) -> BaseModel:
        """
        Validates `input_data` against `input_model`, runs the node's logic,
        and validates the output against `output_model`.
        """
        try:
            input_validated = self.input_model.model_validate(input_data.model_dump())
        except ValidationError as e:
            raise ValueError(f"Input data validation error in {self.name}: {e}")
        except AttributeError:
            input_validated = self.input_model.model_validate(input_data)

        result = await self.run(input_validated)

        try:
            output_validated = self.output_model.model_validate(result.model_dump())
        except ValidationError as e:
            raise ValueError(f"Output data validation error in {self.name}: {e}")

        return output_validated

    @abstractmethod
    async def run(self, input_data: Any) -> Any:
        """
        Abstract method where the node's core logic is implemented.
        Should return an instance compatible with `output_model`.
        """
        pass

    @property
    def config(self) -> Any:
        """
        Return the node's configuration.
        """
        if type(self._config) == dict:
            return self.config_model.model_validate(self._config)  # type: ignore
        return self.config_model.model_validate(self._config.model_dump())

    @staticmethod
    def _get_python_type(
        value_type: DynamicSchemaValueType,
    ) -> Type[Union[int, float, str, bool, List[Any], Dict[Any, Any], Tuple[Any, ...]]]:
        """
        Parse the value_type string into an actual Python type.
        Supports arbitrarily nested types like 'int', 'list[int]', 'dict[str, int]', 'list[dict[str, list[int]]]', etc.
        """

        def parse_type(
            s: str,
        ) -> TSchemaValue:
            s = s.strip().lower()
            if s == "int":
                return int
            elif s in ("int", "float", "str", "bool", "string", "boolean"):
                return {
                    "int": int,
                    "float": float,
                    "str": str,
                    "bool": bool,
                    "string": str,
                    "boolean": bool,
                }[s]
            elif s == "dict":
                return Dict[Any, Any]
            elif s == "list":
                return List[Any]
            elif s.startswith("list[") and s.endswith("]"):
                inner_type_str = s[5:-1]
                inner_type = parse_type(inner_type_str)
                return List[inner_type]
            elif s.startswith("dict[") and s.endswith("]"):
                inner_types_str = s[5:-1]
                key_type_str, value_type_str = split_types(inner_types_str)
                key_type = parse_type(key_type_str)
                value_type = parse_type(value_type_str)
                return Dict[key_type, value_type]
            else:
                raise ValueError(f"Unsupported type: {s}")

        def split_types(s: str) -> Tuple[str, str]:
            """
            Splits the string s at the top-level comma, correctly handling nested brackets.
            """
            depth = 0
            start = 0
            splits: List[str] = []
            for i, c in enumerate(s):
                if c == "[":
                    depth += 1
                elif c == "]":
                    depth -= 1
                elif c == "," and depth == 0:
                    splits.append(s[start:i].strip())
                    start = i + 1
            splits.append(s[start:].strip())
            if len(splits) != 2:
                raise ValueError(f"Invalid dict type specification: {s}")
            return splits[0], splits[1]

        return parse_type(value_type)

    @classmethod
    def get_model_for_schema_dict(
        cls,
        schema: Dict[str, DynamicSchemaValueType],
        schema_name: str,
        base_model: Type[BaseModel] = BaseModel,
    ) -> Type[BaseModel]:
        """
        Create a Pydantic model from a schema dictionary.
        """
        schema_processed = {k: cls._get_python_type(v) for k, v in schema.items()}
        schema_type_dict = {k: (v, ...) for k, v in schema_processed.items()}
        return create_model(
            schema_name,
            **schema_type_dict,  # type: ignore
            __base__=base_model,
        )

    @classmethod
    def get_model_for_value_dict(
        cls,
        values: Dict[str, Any],
        schema_name: str,
        base_model: Type[BaseModel] = BaseModel,
    ) -> Type[BaseModel]:
        """
        Create a Pydantic model from a dictionary of values.
        """
        schema = {k: type(v).__name__ for k, v in values.items()}
        return cls.get_model_for_schema_dict(schema, schema_name, base_model)

    @classmethod
    def get_default_visual_tag(cls) -> VisualTag:
        """
        Set a default visual tag for the node.
        """
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
            "#7FFF00",  # Chartreuse
            "#FA8072",  # Salmon
            "#8A2BE2",  # Violet
        ]
        color = colors[int(md5(cls.__name__.encode()).hexdigest(), 16) % len(colors)]

        return VisualTag(acronym=acronym, color=color)

    @classmethod
    def get_jinja2_template_for_fields(cls, fields: List[str]) -> str:
        """
        Create a default Jinja2 template for a list of fields in YAML format.
        """
        return "\n".join([f"{field}: {{{{{field}}}}}" for field in fields])

    @classmethod
    def hydrate_jinja2_template(cls, template: str, data: Dict[str, Any]) -> str:
        """
        Hydrate a Jinja2 template with data.
        """
        return Template(template).render(data)

from typing import Any, Dict, List, Optional, Type

from pydantic import BaseModel, Field, create_model


def get_nested_field(field_name_with_dots: str, model: BaseModel) -> Any:
    """Get the value of a nested field from a Pydantic model."""
    field_names = field_name_with_dots.split(".")
    value = model
    for field_name in field_names:
        if isinstance(value, dict):
            return value.get(field_name, None)  # type: ignore
        else:
            value = getattr(value, field_name)
    return value


def get_jinja_template_for_model(model: BaseModel) -> str:
    """Generate a Jinja template for a Pydantic model."""
    template = "{\n"
    for field_name, _field in model.model_fields.items():
        template += f'"{field_name}": {{{{field_name}}}},\n'
    template += "}"
    return template


def json_schema_to_model(
    json_schema: Dict[str, Any],
    model_class_name: str = "Output",
    base_class: Type[BaseModel] = BaseModel,
) -> Type[BaseModel]:
    """Convert a JSON schema to a Pydantic BaseModel class.

    Args:
        json_schema: The JSON schema to convert.
        model_class_name: The name of the model class to create.
        base_class: The base class for the model (default is BaseModel).

    Returns:
        A Pydantic BaseModel class.

    """
    # Extract the model name from the schema title.
    model_name = model_class_name

    # Extract the field definitions from the schema properties.
    field_definitions = {
        name: json_schema_to_pydantic_field(name, prop, json_schema.get("required", []))
        for name, prop in json_schema.get("properties", {}).items()
    }

    # Create the BaseModel class using create_model().
    return create_model(model_name, **field_definitions, __base__=base_class)


def json_schema_to_pydantic_field(
    name: str, json_schema: Dict[str, Any], required: List[str]
) -> Any:
    """Convert a JSON schema property to a Pydantic field definition.

    Args:
        name: The field name.
        json_schema: The JSON schema property.
        required: A list of required fields.

    Returns:
        A Pydantic field definition.

    """
    # Get the field type.
    type_ = json_schema_to_pydantic_type(json_schema)

    # Get the field description.
    description = json_schema.get("description")

    # Get the field examples.
    examples = json_schema.get("examples")

    # Create a Field object with the type, description, and examples.
    # The 'required' flag will be set later when creating the model.
    return (
        type_,
        Field(
            description=description,
            examples=examples,
            default=... if name in required else None,
        ),
    )


def json_schema_to_pydantic_type(json_schema: Dict[str, Any]) -> Any:
    """Convert a JSON schema type to a Pydantic type.

    Args:
        json_schema: The JSON schema to convert.

    Returns:
        A Pydantic type.

    """
    type_ = json_schema.get("type")

    if type_ == "string":
        return str
    elif type_ == "integer":
        return int
    elif type_ == "number":
        return float
    elif type_ == "boolean":
        return bool
    elif type_ == "array":
        items_schema = json_schema.get("items")
        if items_schema:
            item_type = json_schema_to_pydantic_type(items_schema)
            return List[item_type]
        else:
            return List
    elif type_ == "object":
        # Handle nested models.
        properties = json_schema.get("properties")
        if properties:
            nested_model = json_schema_to_model(json_schema)
            return nested_model
        else:
            return Dict
    elif type_ == "null":
        return Optional[Any]  # Use Optional[Any] for nullable fields
    else:
        raise ValueError(f"Unsupported JSON schema type: {type_}")


def json_schema_to_simple_schema(json_schema: Dict[str, Any]) -> Dict[str, str]:
    """Convert a JSON schema to a simple schema.

    Args:
        json_schema: The JSON schema to convert.

    Returns:
        A simple schema.

    """
    simple_schema: Dict[str, str] = {}

    for prop, prop_details in json_schema.get("properties", {}).items():
        prop_type = prop_details.get("type")
        if prop_type == "object":
            simple_schema[prop] = "dict"
        elif prop_type == "array":
            simple_schema[prop] = "list"
        elif prop_type == "integer":
            simple_schema[prop] = "int"
        elif prop_type == "number":
            simple_schema[prop] = "float"
        elif prop_type == "boolean":
            simple_schema[prop] = "bool"
        elif prop_type == "string":
            simple_schema[prop] = "string"
        else:
            simple_schema[prop] = "Any"
    return simple_schema

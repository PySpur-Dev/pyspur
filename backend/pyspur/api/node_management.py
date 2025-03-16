from typing import Any, Dict, List

from fastapi import APIRouter

from ..nodes.factory import NodeFactory
from ..nodes.llm._utils import LLMModels

router = APIRouter()


@router.get(
    "/supported_types/",
    description="Get the schemas for all available node types",
)
async def get_node_types() -> Dict[str, List[Dict[str, Any]]]:
    """Return the schemas for all available node types."""
    # get the schemas for each node class
    node_groups = NodeFactory.get_all_node_types()

    response: Dict[str, List[Dict[str, Any]]] = {}
    for group_name, node_types in node_groups.items():
        node_schemas: List[Dict[str, Any]] = []
        for node_type in node_types:
            node_class = node_type.node_class
            try:
                input_schema = node_class.input_model.model_json_schema()
            except AttributeError:
                input_schema = {}
            try:
                output_schema = node_class.output_model.model_json_schema()
            except AttributeError:
                output_schema = {}

            # Get the config schema and update its title with the display name
            config_schema = node_class.config_model.model_json_schema()
            config_schema["title"] = node_type.display_name
            has_fixed_output = node_class.config_model.model_fields["has_fixed_output"].default

            node_schema: Dict[str, Any] = {
                "name": node_type.node_type_name,
                "input": input_schema,
                "output": output_schema,
                "config": config_schema,
                "visual_tag": node_class.get_default_visual_tag().model_dump(),
                "has_fixed_output": has_fixed_output,
            }

            # Add model constraints if this is an LLM node
            if node_type.node_type_name in ["LLMNode", "SingleLLMCallNode"]:
                model_constraints = {}
                for model_enum in LLMModels:
                    model_info = LLMModels.get_model_info(model_enum.value)
                    if model_info:
                        model_constraints[model_enum.value] = model_info.constraints.model_dump()
                node_schema["model_constraints"] = model_constraints

            # Add the logo if available
            logo = node_type.logo
            if logo:
                node_schema["logo"] = logo

            category = node_type.category
            if category:
                node_schema["category"] = category

            node_schemas.append(node_schema)
        response[group_name] = node_schemas

    return response

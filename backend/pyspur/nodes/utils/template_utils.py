import logging
from typing import Any, Dict

from jinja2 import Template


def render_template_or_get_first_string(
    template_str: str, input_dict: Dict[Any, Any], node_name: str
) -> str:
    """
    Renders a template string with the given input dictionary.
    If template is empty, returns the first string value found in the input dictionary.

    Args:
        template_str: The template string to render
        input_dict: Dictionary containing values for template rendering
        node_name: Name of the node (for error logging)

    Returns:
        Rendered template string or first string value from input

    Raises:
        ValueError: If no string value is found in input when template is empty
    """
    try:
        # Render template
        rendered = Template(template_str).render(**input_dict)

        # If template is empty, find first string value
        if not template_str.strip():
            for _, value in input_dict.items():
                if isinstance(value, str):
                    return value
            raise ValueError(f"No string type found in the input dictionary: {input_dict}")

        return rendered

    except Exception as e:
        logging.error(f"Failed to render template in {node_name}")
        logging.error(f"template: {template_str} with input: {input_dict}")
        raise e

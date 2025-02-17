from typing import Any, Dict, Optional, Type, cast
import httpx
from pydantic import BaseModel, create_model

from ..base import BaseNode, BaseNodeOutput, BaseNodeConfig, BaseNodeInput
from .openapi_registry import OpenAPIRegistry


class OpenAPINodeConfig(BaseNodeConfig):
    """Configuration for OpenAPI nodes"""

    spec_name: str
    endpoint: str = "/"
    method: str = "GET"
    base_url: Optional[str] = None
    headers: Dict[str, str] = {}


class OpenAPINodeOutput(BaseNodeOutput):
    """Output model for OpenAPI nodes"""

    response: Dict[str, Any]
    status_code: int
    headers: Dict[str, str]


class OpenAPINode(BaseNode[OpenAPINodeConfig, BaseNodeInput, OpenAPINodeOutput]):
    """Base class for OpenAPI-based nodes"""

    def __init__(self, node_id: str, config: OpenAPINodeConfig):
        super().__init__(node_id, config)

        # Get the OpenAPI spec
        registry = OpenAPIRegistry()
        self.spec = registry.get_spec(self.config.spec_name)
        if not self.spec:
            raise ValueError(f"OpenAPI spec '{self.config.spec_name}' not found")

        # Create input model dynamically based on parameters
        self._input_model = self._create_input_model()

    def _create_input_model(self) -> Type[BaseNodeInput]:
        """Create a Pydantic model for input validation based on OpenAPI spec"""
        fields: Dict[str, tuple] = {}

        # Get operation from spec
        paths = self.spec.spec_content.get("paths", {})
        operation = paths.get(self.config.endpoint, {}).get(
            self.config.method.lower(), {}
        )

        # Add parameters as fields
        for param in operation.get("parameters", []):
            param_name = str(param["name"])
            param_schema = param.get("schema", {})
            param_type = param_schema.get("type", "string")
            required = param.get("required", False)

            # Map OpenAPI types to Python types
            type_mapping = {
                "string": str,
                "integer": int,
                "number": float,
                "boolean": bool,
                "array": list,
                "object": dict,
            }

            python_type = type_mapping.get(param_type, Any)
            if not required:
                python_type = Optional[python_type]

            fields[param_name] = (python_type, None if required else ...)

        # Add request body if present
        if "requestBody" in operation:
            content = operation["requestBody"].get("content", {})
            if "application/json" in content:
                fields["body"] = (
                    Dict[str, Any],
                    None if operation["requestBody"].get("required", True) else ...,
                )

        # Create the model class
        model = create_model(
            f"{self.config.spec_name}Input", __base__=BaseNodeInput, **fields
        )
        return cast(Type[BaseNodeInput], model)

    async def process(self, inputs: Dict[str, Any]) -> OpenAPINodeOutput:
        """Process the node by making an HTTP request to the API"""
        # Validate inputs using the dynamically created model
        validated_data = self._input_model(**inputs)

        # Prepare request
        base_url = self.config.base_url or self.spec.spec_content.get("servers", [{}])[
            0
        ].get("url", "")
        url = f"{base_url.rstrip('/')}/{self.config.endpoint.lstrip('/')}"

        # Extract query parameters and body
        params: Dict[str, Any] = {}
        data = None

        for field_name, value in validated_data.model_dump().items():
            if field_name == "body":
                data = value
            else:
                params[field_name] = value

        # Make request
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=self.config.method,
                url=url,
                params=params,
                json=data,
                headers=self.config.headers,
            )

        # Return output
        return OpenAPINodeOutput(
            response=response.json(),
            status_code=response.status_code,
            headers=dict(response.headers),
        )

from typing import Dict, Optional, Any
from pydantic import BaseModel
import yaml
from pathlib import Path


class OpenAPISpec(BaseModel):
    """Model to store OpenAPI specification metadata"""

    name: str
    category: str
    spec_content: Dict[str, Any]
    description: Optional[str] = None


class OpenAPIRegistry:
    """Registry to manage OpenAPI specifications"""

    _instance = None
    _specs: Dict[str, OpenAPISpec] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(OpenAPIRegistry, cls).__new__(cls)
        return cls._instance

    @classmethod
    def register_spec(
        cls,
        name: str,
        category: str,
        spec_content: Dict[str, Any],
        description: Optional[str] = None,
    ) -> None:
        """Register a new OpenAPI specification"""
        spec = OpenAPISpec(
            name=name,
            category=category,
            spec_content=spec_content,
            description=description,
        )
        cls._specs[name] = spec

    @classmethod
    def get_spec(cls, name: str) -> Optional[OpenAPISpec]:
        """Get a registered specification by name"""
        return cls._specs.get(name)

    @classmethod
    def list_specs(cls) -> Dict[str, OpenAPISpec]:
        """List all registered specifications"""
        return cls._specs

    @classmethod
    def load_specs_from_directory(cls, directory: str) -> None:
        """Load all OpenAPI specs from a directory"""
        spec_dir = Path(directory)
        for spec_file in spec_dir.glob("*.yaml"):
            with open(spec_file) as f:
                spec_content = yaml.safe_load(f)
                name = spec_file.stem
                # Try to get category from spec info or use default
                category = spec_content.get("info", {}).get("x-category", "API")
                description = spec_content.get("info", {}).get("description")
                cls.register_spec(name, category, spec_content, description)

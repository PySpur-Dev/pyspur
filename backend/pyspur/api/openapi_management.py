from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Path, Body
from pydantic import BaseModel
import yaml

from ..nodes.openapi.openapi_registry import OpenAPIRegistry


router = APIRouter()


class OpenAPISpecResponse(BaseModel):
    """Response model for OpenAPI spec information"""

    name: str
    category: str
    description: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "name": "pet_store",
                "category": "Sample APIs",
                "description": "A sample API for managing pets",
            }
        }


class OpenAPISpecRequest(BaseModel):
    """Request model for registering OpenAPI spec via JSON"""

    name: str
    category: str
    description: Optional[str] = None
    spec_content: Dict[str, Any]

    class Config:
        json_schema_extra = {
            "example": {
                "name": "pet_store",
                "category": "Sample APIs",
                "description": "A sample API for managing pets",
                "spec_content": {
                    "openapi": "3.0.0",
                    "info": {
                        "title": "Pet Store API",
                        "description": "A sample API for managing pets",
                        "version": "1.0.0",
                        "x-category": "Sample APIs",
                    },
                    "servers": [
                        {
                            "url": "https://api.petstore.example.com/v1",
                            "description": "Production server",
                        }
                    ],
                    "paths": {
                        "/pets": {
                            "get": {
                                "summary": "List all pets",
                                "parameters": [
                                    {
                                        "name": "limit",
                                        "in": "query",
                                        "description": "Maximum number of pets to return",
                                        "required": False,
                                        "schema": {
                                            "type": "integer",
                                            "minimum": 1,
                                            "maximum": 100,
                                            "default": 20,
                                        },
                                    }
                                ],
                            }
                        }
                    },
                },
            }
        }


@router.post("/specs/upload", response_model=OpenAPISpecResponse)
async def register_spec_file(
    name: str = Form(
        ..., description="Name of the API specification", example="pet_store"
    ),
    category: str = Form(
        ..., description="Category for grouping APIs", example="Sample APIs"
    ),
    description: Optional[str] = Form(
        None,
        description="Description of the API",
        example="A sample API for managing pets",
    ),
    spec_file: UploadFile = File(..., description="OpenAPI specification file (YAML)"),
):
    """
    Register a new OpenAPI specification using a YAML file upload.

    Upload a YAML file containing the OpenAPI specification. The specification will be used to create dynamic nodes in the system.
    """
    try:
        # Read and parse YAML content
        content = await spec_file.read()
        spec_content = yaml.safe_load(content)

        if not spec_content:
            raise HTTPException(
                status_code=400, detail="Invalid YAML specification content"
            )

        # Register spec
        registry = OpenAPIRegistry()
        registry.register_spec(name, category, spec_content, description)

        return OpenAPISpecResponse(
            name=name, category=category, description=description
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/specs/json", response_model=OpenAPISpecResponse)
async def register_spec_json(
    spec: OpenAPISpecRequest = Body(
        ..., description="OpenAPI specification and metadata"
    )
):
    """
    Register a new OpenAPI specification using JSON content.

    Submit the OpenAPI specification as JSON in the request body. The specification will be used to create dynamic nodes in the system.
    """
    try:
        # Register spec
        registry = OpenAPIRegistry()
        registry.register_spec(
            spec.name, spec.category, spec.spec_content, spec.description
        )

        return OpenAPISpecResponse(
            name=spec.name, category=spec.category, description=spec.description
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/specs", response_model=List[OpenAPISpecResponse])
async def list_specs():
    """
    List all registered OpenAPI specifications.

    Returns a list of all registered API specifications that can be used to create nodes.
    """
    registry = OpenAPIRegistry()
    specs = registry.list_specs()

    return [
        OpenAPISpecResponse(
            name=spec.name, category=spec.category, description=spec.description
        )
        for spec in specs.values()
    ]


@router.get("/specs/{name}", response_model=OpenAPISpecResponse)
async def get_spec(
    name: str = Path(
        ...,
        description="Name of the API specification to retrieve",
        example="pet_store",
    )
):
    """
    Get details of a specific OpenAPI specification.

    Retrieves information about a registered API specification by its name.
    """
    registry = OpenAPIRegistry()
    spec = registry.get_spec(name)

    if not spec:
        raise HTTPException(status_code=404, detail=f"Spec '{name}' not found")

    return OpenAPISpecResponse(
        name=spec.name, category=spec.category, description=spec.description
    )

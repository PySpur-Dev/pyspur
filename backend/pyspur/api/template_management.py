import json
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.workflow_schemas import (
    WorkflowCreateRequestSchema,
    WorkflowResponseSchema,
)
from .workflow_management import create_workflow


class TemplateSchema(BaseModel):
    name: str
    description: str
    features: List[str]
    file_name: str


router = APIRouter()

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"

print(f"TEMPLATES_DIR resolved to: {TEMPLATES_DIR.resolve()}")


@router.get(
    "/",
    description="List all available templates",
    response_model=List[TemplateSchema],
)
def list_templates() -> List[TemplateSchema]:
    if not TEMPLATES_DIR.exists():
        raise HTTPException(status_code=500, detail="Templates directory not found")

    # Sort by creation time in descending (most recent first)
    sorted_template_files = sorted(
        TEMPLATES_DIR.glob("*.json"),
        key=lambda p: p.stat().st_ctime,
        reverse=True,
    )

    templates: List[TemplateSchema] = []
    for template_file in sorted_template_files:
        with open(template_file, "r") as f:
            template_content = json.load(f)
            metadata = template_content.get("metadata", {})
            templates.append(
                TemplateSchema.model_validate(
                    {
                        "name": metadata.get("name", template_file.stem),
                        "description": metadata.get("description", ""),
                        "features": metadata.get("features", []),
                        "file_name": template_file.name,
                    }
                )
            )
    return templates


@router.post(
    "/instantiate/",
    description="Instantiate a new workflow from a template",
    response_model=WorkflowResponseSchema,
)
def instantiate_template(template: TemplateSchema, db: Session = Depends(get_db)):
    template_file_name = template.file_name
    template_path = TEMPLATES_DIR / template_file_name
    print(f"Requested template: {template_file_name}")
    print(f"Resolved template path: {template_path}")
    if not template_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    with open(template_path, "r") as f:
        template_content = json.load(f)
    metadata = template_content.get("metadata", {})
    workflow_definition = template_content.get("definition", {})
    new_workflow = create_workflow(
        WorkflowCreateRequestSchema(
            name=metadata.get("name", "Untitled Workflow"),
            description=metadata.get("description", ""),
            definition=workflow_definition,
        ),
        db,
    )
    return new_workflow

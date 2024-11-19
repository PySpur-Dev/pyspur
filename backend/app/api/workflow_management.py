from typing import List
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from ..schemas.workflow_schemas import (
    WorkflowNodeCoordinatesSchema,
    WorkflowCreateRequestSchema,
    WorkflowNodeSchema,
    WorkflowResponseSchema,
    WorkflowDefinitionSchema,
)
from ..database import get_db
from ..models.workflow_model import WorkflowModel as WorkflowModel

router = APIRouter()


def create_a_new_workflow_definition() -> WorkflowDefinitionSchema:
    return WorkflowDefinitionSchema(
        nodes=[
            WorkflowNodeSchema(
                id="input_node",
                node_type="InputNode",
                coordinates=WorkflowNodeCoordinatesSchema(x=100, y=100),
                config={},
            )
        ],
        links=[],
    )


@router.post(
    "/", response_model=WorkflowResponseSchema, description="Create a new workflow"
)
def create_workflow(
    workflow_request: WorkflowCreateRequestSchema, db: Session = Depends(get_db)
) -> WorkflowResponseSchema:
    if not workflow_request.definition:
        workflow_request.definition = create_a_new_workflow_definition()
    new_workflow = WorkflowModel(
        name=workflow_request.name or "Untitled Workflow",
        description=workflow_request.description,
        definition=(workflow_request.definition.model_dump()),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(new_workflow)
    db.commit()
    db.refresh(new_workflow)
    return new_workflow


@router.put(
    "/{workflow_id}/",
    response_model=WorkflowResponseSchema,
    description="Update a workflow",
)
def update_workflow(
    workflow_id: str,
    workflow_request: WorkflowCreateRequestSchema,
    db: Session = Depends(get_db),
) -> WorkflowResponseSchema:
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not workflow_request.definition:
        raise HTTPException(
            status_code=400,
            detail="Workflow definition is required to update a workflow",
        )
    workflow.definition = workflow_request.definition.model_dump()
    workflow.name = workflow_request.name
    workflow.description = workflow_request.description
    workflow.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(workflow)
    return workflow


@router.get(
    "/", response_model=List[WorkflowResponseSchema], description="List all workflows"
)
def list_workflows(db: Session = Depends(get_db)):
    workflows = (
        db.query(WorkflowModel)
        .order_by(WorkflowModel.created_at.desc())
        .slice(0, 10)
        .all()
    )
    return workflows


@router.get(
    "/{workflow_id}/",
    response_model=WorkflowResponseSchema,
    description="Get a workflow by ID",
)
def get_workflow(
    workflow_id: str, db: Session = Depends(get_db)
) -> WorkflowResponseSchema:
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.put(
    "/{workflow_id}/reset/",
    response_model=WorkflowResponseSchema,
    description="Reset a workflow to its initial state",
)
def reset_workflow(
    workflow_id: str, db: Session = Depends(get_db)
) -> WorkflowResponseSchema:
    # Fetch the workflow by ID
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()

    # If workflow not found, raise 404 error
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Reset the workflow definition to a new one
    workflow.definition = create_a_new_workflow_definition().model_dump()

    # Update the updated_at timestamp
    workflow.updated_at = datetime.now(timezone.utc)

    # Commit the changes to the database
    db.commit()
    db.refresh(workflow)

    # Return the updated workflow
    return workflow


@router.delete(
    "/{workflow_id}/",
    status_code=status.HTTP_204_NO_CONTENT,
    description="Delete a workflow by ID",
)
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    # Fetch the workflow by ID
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()

    # If workflow not found, raise 404 error
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Delete the workflow
    db.delete(workflow)
    db.commit()

    # Return no content status
    return None


@router.post(
    "/{workflow_id}/duplicate/",
    response_model=WorkflowResponseSchema,
    description="Duplicate a workflow by ID",
)
def duplicate_workflow(
    workflow_id: str, db: Session = Depends(get_db)
) -> WorkflowResponseSchema:
    # Fetch the workflow by ID
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()

    # If workflow not found, raise 404 error
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Create a new WorkflowModel instance by copying fields
    new_workflow = WorkflowModel(
        name=f"{workflow.name} (Copy)",
        description=workflow.description,
        definition=workflow.definition,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    # Add and commit the new workflow
    db.add(new_workflow)
    db.commit()
    db.refresh(new_workflow)

    # Return the duplicated workflow
    return new_workflow

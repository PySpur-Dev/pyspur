from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.workflow_model import WorkflowModel
from ..schemas.workflow_schemas import WorkflowDefinitionSchema, WorkflowResponseSchema
from ..workflow_code_handler import WorkflowCodeHandler


class WorkflowCodeRequest(BaseModel):
    """Request to generate code from a workflow or create a workflow from code."""

    code: Optional[str] = None
    workflow_id: Optional[str] = None
    preserve_coordinates: bool = True
    preserve_dimensions: bool = True


class WorkflowCodeResponse(BaseModel):
    """Response containing generated workflow code."""

    code: str


router = APIRouter()


@router.get(
    "/{workflow_id}",
    response_model=WorkflowCodeResponse,
    description="Generate Python code from a workflow definition",
)
def get_workflow_code(
    workflow_id: str,
    preserve_coordinates: bool = Query(
        True, description="Whether to include node coordinates in the code"
    ),
    preserve_dimensions: bool = Query(
        True, description="Whether to include node dimensions in the code"
    ),
    db: Session = Depends(get_db),
) -> WorkflowCodeResponse:
    """Generate Python code from a workflow definition.

    Args:
        workflow_id: The ID of the workflow to generate code for
        preserve_coordinates: Whether to include node coordinates in the code
        preserve_dimensions: Whether to include node dimensions in the code
        db: Database session

    Returns:
        The generated Python code for the workflow

    """
    # Fetch the workflow
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Parse the workflow definition
    try:
        workflow_def = WorkflowDefinitionSchema.model_validate(workflow.definition)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to parse workflow definition: {str(e)}"
        ) from e

    # Generate code from the workflow definition
    try:
        code = WorkflowCodeHandler.generate_code(
            workflow_def,
            workflow_name=workflow.name,
            workflow_description=workflow.description or "",
            preserve_coordinates=preserve_coordinates,
            preserve_dimensions=preserve_dimensions,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate code: {str(e)}") from e

    return WorkflowCodeResponse(code=code)


@router.post(
    "/create_from_code",
    response_model=WorkflowResponseSchema,
    description="Create a new workflow from Python code",
)
def create_workflow_from_code(
    request: WorkflowCodeRequest = Body(...),
    db: Session = Depends(get_db),
) -> WorkflowResponseSchema:
    """Create a new workflow from Python code.

    Args:
        request: The request containing the workflow code
        db: Database session

    Returns:
        The created workflow

    """
    if not request.code:
        raise HTTPException(status_code=400, detail="Code is required")

    # Parse the code to get a workflow definition
    try:
        workflow_def = WorkflowCodeHandler.parse_code(request.code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse code: {str(e)}") from e

    # Extract name from the code if possible
    workflow_name = "Code Workflow"
    workflow_description = ""

    # Try to find the name from the code
    try:
        import ast

        tree = ast.parse(request.code)
        for node in ast.walk(tree):
            # Look for WorkflowBuilder constructor calls
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "WorkflowBuilder"
            ):
                if len(node.args) > 0 and isinstance(node.args[0], ast.Constant):
                    workflow_name = node.args[0].value
                if len(node.args) > 1 and isinstance(node.args[1], ast.Constant):
                    workflow_description = node.args[1].value
                break
    except Exception:
        # If we can't parse the name, just use the default
        pass

    # Create a new workflow record
    try:
        new_workflow = WorkflowModel(
            name=workflow_name,
            description=workflow_description,
            definition=workflow_def.model_dump(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        db.add(new_workflow)
        db.commit()
        db.refresh(new_workflow)

        return new_workflow
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create workflow: {str(e)}") from e


@router.put(
    "/{workflow_id}",
    response_model=WorkflowResponseSchema,
    description="Update a workflow from Python code",
)
def update_workflow_from_code(
    workflow_id: str,
    request: WorkflowCodeRequest = Body(...),
    db: Session = Depends(get_db),
) -> WorkflowResponseSchema:
    """Update an existing workflow from Python code.

    Args:
        workflow_id: The ID of the workflow to update
        request: The request containing the workflow code
        db: Database session

    Returns:
        The updated workflow

    """
    if not request.code:
        raise HTTPException(status_code=400, detail="Code is required")

    # Fetch the workflow
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Parse the existing workflow for metadata preservation
    try:
        existing_workflow = WorkflowDefinitionSchema.model_validate(workflow.definition)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to parse existing workflow definition: {str(e)}"
        ) from e

    # Parse the code to get a workflow definition, preserving UI metadata
    try:
        workflow_def = WorkflowCodeHandler.parse_code(
            request.code, existing_workflow=existing_workflow
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse code: {str(e)}") from e

    # Update the workflow
    try:
        workflow.definition = workflow_def.model_dump()
        workflow.updated_at = datetime.now(timezone.utc)

        # Extract name from the code if possible
        try:
            import ast

            tree = ast.parse(request.code)
            for node in ast.walk(tree):
                # Look for WorkflowBuilder constructor calls
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name)
                    and node.func.id == "WorkflowBuilder"
                ):
                    if len(node.args) > 0 and isinstance(node.args[0], ast.Constant):
                        workflow.name = node.args[0].value
                    if len(node.args) > 1 and isinstance(node.args[1], ast.Constant):
                        workflow.description = node.args[1].value
                    break
        except Exception:
            # If we can't parse the name, keep the existing name
            pass

        db.commit()
        db.refresh(workflow)

        return workflow
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update workflow: {str(e)}") from e


@router.post(
    "/code_to_definition",
    response_model=WorkflowDefinitionSchema,
    description="Convert Python code to a workflow definition without saving",
)
def code_to_definition(
    request: WorkflowCodeRequest = Body(...),
    db: Session = Depends(get_db),
) -> WorkflowDefinitionSchema:
    """Convert Python code to a workflow definition without saving to the database.

    Args:
        request: The request containing the workflow code
        db: Database session (unused but required by FastAPI)

    Returns:
        The converted workflow definition

    """
    if not request.code:
        raise HTTPException(status_code=400, detail="Code is required")

    # Parse the code to get a workflow definition
    try:
        # If a workflow_id is provided, use it to preserve UI metadata
        existing_workflow = None
        if request.workflow_id:
            workflow = (
                db.query(WorkflowModel).filter(WorkflowModel.id == request.workflow_id).first()
            )
            if workflow:
                try:
                    existing_workflow = WorkflowDefinitionSchema.model_validate(workflow.definition)
                except Exception:
                    # If we can't parse the existing workflow, continue without it
                    pass

        workflow_def = WorkflowCodeHandler.parse_code(
            request.code, existing_workflow=existing_workflow
        )
        return workflow_def
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse code: {str(e)}") from e


@router.post(
    "/definition_to_code",
    response_model=WorkflowCodeResponse,
    description="Convert a workflow definition to Python code without saving",
)
def definition_to_code(
    workflow_def: WorkflowDefinitionSchema = Body(...),
    preserve_coordinates: bool = Query(
        True, description="Whether to include node coordinates in the code"
    ),
    preserve_dimensions: bool = Query(
        True, description="Whether to include node dimensions in the code"
    ),
) -> WorkflowCodeResponse:
    """Convert a workflow definition to Python code without saving to the database.

    Args:
        workflow_def: The workflow definition to convert
        preserve_coordinates: Whether to include node coordinates in the code
        preserve_dimensions: Whether to include node dimensions in the code

    Returns:
        The generated Python code

    """
    try:
        code = WorkflowCodeHandler.generate_code(
            workflow_def,
            workflow_name="Workflow",
            workflow_description="",
            preserve_coordinates=preserve_coordinates,
            preserve_dimensions=preserve_dimensions,
        )
        return WorkflowCodeResponse(code=code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate code: {str(e)}") from e

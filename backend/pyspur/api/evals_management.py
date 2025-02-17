from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..evals.evaluator import load_yaml_config, prepare_and_evaluate_dataset
from ..models.eval_run_model import EvalRunModel, EvalRunStatus
from ..models.workflow_model import WorkflowModel
from ..schemas.eval_schemas import (
    EvalRunRequest,
    EvalRunResponse,
    EvalRunStatusEnum,
)
from ..schemas.workflow_schemas import WorkflowDefinitionSchema
from .workflow_management import get_workflow_output_variables

router = APIRouter()

EVALS_DIR = Path(__file__).parent.parent / "evals" / "tasks"


@router.get("/", description="List all available evals")
def list_evals() -> List[Dict[str, Any]]:
    """
    List all available evals by scanning the tasks directory for YAML files.
    """
    evals = []
    if not EVALS_DIR.exists():
        raise HTTPException(status_code=500, detail="Evals directory not found")
    for eval_file in EVALS_DIR.glob("*.yaml"):
        try:
            eval_content = load_yaml_config(yaml_path=eval_file)
            metadata = eval_content.get("metadata", {})
            evals.append(
                {
                    "name": metadata.get("name", eval_file.stem),
                    "description": metadata.get("description", ""),
                    "type": metadata.get("type", "Unknown"),
                    "num_samples": metadata.get("num_samples", "N/A"),
                    "paper_link": metadata.get("paper_link", ""),
                    "file_name": eval_file.name,
                }
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error parsing {eval_file.name}: {e}")
    return evals


@router.post(
    "/launch/",
    response_model=EvalRunResponse,
    description="Launch an eval job with detailed validation and workflow integration",
)
async def launch_eval(
    request: EvalRunRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> EvalRunResponse:
    """
    Launch an eval job by triggering the evaluator with the specified eval configuration.
    """
    # Validate workflow ID
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == request.workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow_definition = WorkflowDefinitionSchema.model_validate(workflow.definition)

    eval_file = EVALS_DIR / f"{request.eval_name}.yaml"
    if not eval_file.exists():
        raise HTTPException(status_code=404, detail="Eval configuration not found")

    try:
        # Load the eval configuration
        eval_config = load_yaml_config(eval_file)

        # Validate the output variable
        leaf_node_output_variables = get_workflow_output_variables(
            workflow_id=request.workflow_id, db=db
        )

        print(f"Valid output variables: {leaf_node_output_variables}")

        # Extract the list of valid prefixed variables
        valid_prefixed_variables = [var["prefixed_variable"] for var in leaf_node_output_variables]

        if request.output_variable not in valid_prefixed_variables:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid output variable '{request.output_variable}'. "
                    f"Must be one of: {leaf_node_output_variables}"
                ),
            )

        # Create a new EvalRunModel instance
        new_eval_run = EvalRunModel(
            eval_name=request.eval_name,
            workflow_id=request.workflow_id,
            output_variable=request.output_variable,
            num_samples=request.num_samples,
            status=EvalRunStatus.PENDING,
            start_time=datetime.now(timezone.utc),
        )
        db.add(new_eval_run)
        db.commit()
        db.refresh(new_eval_run)

        async def run_eval_task(eval_run_id: str):
            with next(get_db()) as session:
                eval_run = (
                    session.query(EvalRunModel).filter(EvalRunModel.id == eval_run_id).first()
                )
                if not eval_run:
                    session.close()
                    return

                eval_run.status = EvalRunStatus.RUNNING
                session.commit()

                try:
                    # Run the evaluation asynchronously
                    results = await prepare_and_evaluate_dataset(
                        eval_config,
                        workflow_definition=workflow_definition,
                        num_samples=eval_run.num_samples,
                        output_variable=eval_run.output_variable,
                    )
                    eval_run.results = results
                    eval_run.status = EvalRunStatus.COMPLETED
                    eval_run.end_time = datetime.now(timezone.utc)
                except Exception as e:
                    eval_run.status = EvalRunStatus.FAILED
                    eval_run.end_time = datetime.now(timezone.utc)
                    session.commit()
                    raise e
                finally:
                    session.commit()

        background_tasks.add_task(run_eval_task, new_eval_run.id)

        # Return all required parameters
        return EvalRunResponse(
            run_id=new_eval_run.id,
            eval_name=new_eval_run.eval_name,
            workflow_id=new_eval_run.workflow_id,
            status=EvalRunStatusEnum(new_eval_run.status.value),
            start_time=new_eval_run.start_time,
            end_time=new_eval_run.end_time,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error launching eval: {e}")


@router.get(
    "/runs/{eval_run_id}",
    response_model=EvalRunResponse,
    description="Get the status of an eval run",
)
async def get_eval_run_status(eval_run_id: str, db: Session = Depends(get_db)) -> EvalRunResponse:
    eval_run = db.query(EvalRunModel).filter(EvalRunModel.id == eval_run_id).first()
    if not eval_run:
        raise HTTPException(status_code=404, detail="Eval run not found")
    return EvalRunResponse(
        run_id=eval_run.id,
        eval_name=eval_run.eval_name,
        workflow_id=eval_run.workflow_id,
        status=EvalRunStatusEnum(eval_run.status.value),
        start_time=eval_run.start_time,
        end_time=eval_run.end_time,
        results=eval_run.results,
    )


@router.get(
    "/runs/",
    response_model=List[EvalRunResponse],
    description="List all eval runs",
)
async def list_eval_runs(
    db: Session = Depends(get_db),
) -> List[EvalRunResponse]:
    eval_runs = db.query(EvalRunModel).order_by(EvalRunModel.start_time.desc()).all()
    return [
        EvalRunResponse(
            run_id=eval_run.id,
            eval_name=eval_run.eval_name,
            workflow_id=eval_run.workflow_id,
            status=EvalRunStatusEnum(eval_run.status.value),
            start_time=eval_run.start_time,
            end_time=eval_run.end_time,
        )
        for eval_run in eval_runs
    ]

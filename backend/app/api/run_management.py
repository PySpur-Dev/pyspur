from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from trio import TaskStatus

from ..schemas.run_schemas import RunResponseSchema, RunStatusResponseSchema
from ..database import get_db
from ..models.run_model import RunModel, RunStatus
from ..models.task_model import TaskStatus

router = APIRouter()


@router.get(
    "/",
    response_model=List[RunResponseSchema],
    description="List all runs",
)
def list_runs(
    last_k: int = 10,
    parent_only: bool = True,
    run_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(RunModel)

    if parent_only:
        query = query.filter(RunModel.parent_run_id.is_(None))
    if run_type:
        query = query.filter(RunModel.run_type == run_type)
    runs = query.order_by(RunModel.start_time.desc()).limit(last_k).all()
    return runs


@router.get("/{run_id}/status/", response_model=RunStatusResponseSchema)
def get_run_status(run_id: str, db: Session = Depends(get_db)):
    run = db.query(RunModel).filter(RunModel.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    output_file_id = None
    if run.status == RunStatus.COMPLETED:
        # find output file id
        output_file = run.output_file
        if output_file:
            output_file_id = output_file.id

    tasks = run.tasks
    tasks_meta = [
        {
            "node_id": task.node_id,
            "status": task.status,
            "inputs": task.inputs,
            "outputs": task.outputs,
            "run_time": task.run_time,
        }
        for task in tasks
    ]
    # fail if any task has failed
    for task in tasks:
        if task.status == TaskStatus.FAILED:
            # update run status to failed
            run.status = RunStatus.FAILED
            db.commit()
            break

    combined_task_outputs: Dict[str, Any] = {}
    for task in tasks:
        combined_task_outputs[task.node_id] = task.outputs
    return RunStatusResponseSchema(
        id=run.id,
        status=run.status,
        start_time=run.start_time,
        end_time=run.end_time,
        outputs=combined_task_outputs,
        tasks=tasks_meta,
        output_file_id=output_file_id,
    )

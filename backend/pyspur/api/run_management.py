from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.run_model import RunModel, RunStatus
from ..models.task_model import TaskStatus
from ..schemas.run_schemas import RunResponseSchema

router = APIRouter()


@router.get(
    "/",
    response_model=List[RunResponseSchema],
    description="List all runs",
)
def list_runs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    parent_only: bool = True,
    run_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size
    query = db.query(RunModel)

    if parent_only:
        query = query.filter(RunModel.parent_run_id.is_(None))
    if run_type:
        query = query.filter(RunModel.run_type == run_type)

    runs = query.order_by(RunModel.start_time.desc()).offset(offset).limit(page_size).all()
    return runs


@router.get("/{run_id}/", response_model=RunResponseSchema)
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(RunModel).filter(RunModel.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/status/", response_model=RunResponseSchema)
def get_run_status(run_id: str, db: Session = Depends(get_db)):
    run = db.query(RunModel).filter(RunModel.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != RunStatus.FAILED:
        failed_tasks = [task for task in run.tasks if task.status == TaskStatus.FAILED]
        running_and_pending_tasks = [
            task for task in run.tasks if task.status in [TaskStatus.PENDING, TaskStatus.RUNNING]
        ]
        if failed_tasks and len(running_and_pending_tasks) == 0:
            run.status = RunStatus.FAILED
            db.commit()
            db.refresh(run)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run

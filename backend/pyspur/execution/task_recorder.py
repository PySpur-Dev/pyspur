from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models.task_model import TaskModel, TaskStatus
from ..schemas.workflow_schemas import WorkflowDefinitionSchema


class TaskRecorder:
    def __init__(self, db: Session, run_id: str):
        self.db = db
        self.run_id = run_id
        self.tasks: Dict[str, TaskModel] = {}

    def create_task(
        self,
        node_id: str,
        inputs: Dict[str, Any],
    ):
        task = TaskModel(
            run_id=self.run_id,
            node_id=node_id,
            inputs=inputs,
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        self.tasks[node_id] = task
        return

    def update_task(
        self,
        node_id: str,
        status: TaskStatus,
        inputs: Optional[Dict[str, Any]] = None,
        outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        subworkflow: Optional[WorkflowDefinitionSchema] = None,
        subworkflow_output: Optional[Dict[str, BaseModel]] = None,
        end_time: Optional[datetime] = None,
    ):
        task = self.tasks.get(node_id)
        if not task:
            self.create_task(node_id, inputs={})
            task = self.tasks[node_id]
        task.status = status
        if inputs:
            task.inputs = inputs
        if outputs:
            task.outputs = outputs
        if error:
            task.error = error
        if end_time:
            task.end_time = end_time
        if subworkflow:
            task.subworkflow = subworkflow.model_dump()
        if subworkflow_output:
            task.subworkflow_output = {
                k: (
                    [x.model_dump() if isinstance(x, BaseModel) else x for x in v]
                    if isinstance(v, list)
                    else v.model_dump()
                )
                for k, v in subworkflow_output.items()
            }
        self.db.add(task)
        self.db.commit()
        return

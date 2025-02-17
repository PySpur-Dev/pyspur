from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel

from ..models.task_model import TaskStatus
from .workflow_schemas import WorkflowDefinitionSchema


class TaskResponseSchema(BaseModel):
    id: str
    run_id: str
    node_id: str
    parent_task_id: Optional[str]
    status: TaskStatus
    inputs: Optional[Any]
    outputs: Optional[Any]
    error: Optional[str]
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    subworkflow: Optional[WorkflowDefinitionSchema]
    subworkflow_output: Optional[Dict[str, Any]]

    class Config:
        from_attributes = True  # Enable ORM mode

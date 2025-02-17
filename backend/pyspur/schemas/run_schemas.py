from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, computed_field

from ..models.run_model import RunStatus
from .task_schemas import TaskResponseSchema, TaskStatus
from .workflow_schemas import WorkflowVersionResponseSchema


class StartRunRequestSchema(BaseModel):
    initial_inputs: Optional[Dict[str, Dict[str, Any]]] = None
    parent_run_id: Optional[str] = None
    files: Optional[Dict[str, List[str]]] = None  # Maps node_id to list of file paths


class RunResponseSchema(BaseModel):
    id: str
    workflow_id: str
    workflow_version_id: str
    workflow_version: WorkflowVersionResponseSchema
    status: RunStatus
    run_type: str
    initial_inputs: Optional[Dict[str, Dict[str, Any]]]
    input_dataset_id: Optional[str]
    outputs: Optional[Dict[str, Any]]
    output_file_id: Optional[str]
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    tasks: List[TaskResponseSchema]

    @computed_field(return_type=float)
    def percentage_complete(self):
        if not self.tasks:
            return 0
        completed_tasks = sum(1 for task in self.tasks if task.status == TaskStatus.COMPLETED)
        return completed_tasks / len(self.tasks) * 100

    class Config:
        from_attributes = True


class PartialRunRequestSchema(BaseModel):
    node_id: str
    rerun_predecessors: bool = False
    initial_inputs: Optional[Dict[str, Dict[str, Any]]] = None
    partial_outputs: Optional[Dict[str, Dict[str, Any] | List[Dict[str, Any]]]] = None


class BatchRunRequestSchema(BaseModel):
    dataset_id: str
    mini_batch_size: int = 10

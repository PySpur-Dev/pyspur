from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, computed_field

from ..models.run_model import RunStatus
from ..nodes.logic.human_intervention import PauseAction
from .task_schemas import TaskResponseSchema, TaskStatus
from .workflow_schemas import WorkflowVersionResponseSchema


class StartRunRequestSchema(BaseModel):
    initial_inputs: Optional[Dict[str, Dict[str, Any]]] = None
    parent_run_id: Optional[str] = None
    files: Optional[Dict[str, List[str]]] = None  # Maps node_id to list of file paths


class RunResponseSchema(BaseModel):
    id: str
    workflow_id: str
    workflow_version_id: Optional[str] = None
    workflow_version: Optional[WorkflowVersionResponseSchema] = None
    status: RunStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    initial_inputs: Optional[Dict[str, Dict[str, Any]]] = None
    outputs: Optional[Dict[str, Dict[str, Any]]] = None
    tasks: List[TaskResponseSchema] = []
    parent_run_id: Optional[str] = None
    run_type: str = "interactive"
    output_file_id: Optional[str] = None
    input_dataset_id: Optional[str] = None
    message: Optional[str] = None  # Add message field for additional info

    @computed_field
    def duration(self) -> Optional[float]:
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        elif self.start_time:
            now = datetime.now(self.start_time.tzinfo)
            return (now - self.start_time).total_seconds()
        return None

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


class ResumeRunRequestSchema(BaseModel):
    """
    Schema for resuming a paused workflow run.
    """
    inputs: Dict[str, Any]  # Human-provided inputs for the paused node
    user_id: str  # ID of the user resuming the workflow
    action: PauseAction  # Action taken (APPROVE/DECLINE/OVERRIDE)
    comments: Optional[str] = None  # Optional comments about the decision


class BatchRunRequestSchema(BaseModel):
    dataset_id: str
    mini_batch_size: int = 10

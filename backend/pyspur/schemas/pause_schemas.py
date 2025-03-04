from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel

from ..nodes.logic.human_intervention import PauseAction
from .run_schemas import RunResponseSchema
from .workflow_schemas import WorkflowDefinitionSchema


class PauseHistoryResponseSchema(BaseModel):
    """Schema for pause information from a node's output."""
    id: str  # Synthetic ID for API compatibility
    run_id: str
    node_id: str
    pause_message: Optional[str]
    pause_time: datetime
    resume_time: Optional[datetime]
    resume_user_id: Optional[str]
    resume_action: Optional[PauseAction]
    input_data: Optional[Dict[str, Any]]
    comments: Optional[str]


class PausedWorkflowResponseSchema(BaseModel):
    """Schema for a paused workflow, including its current pause state."""
    run: RunResponseSchema
    current_pause: PauseHistoryResponseSchema
    workflow: WorkflowDefinitionSchema
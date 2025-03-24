from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, validator


class WorkflowScheduleCreateSchema(BaseModel):
    """Schema for creating a new workflow schedule."""

    workflow_id: str
    name: str
    cron_expression: str
    initial_inputs: Optional[Dict[str, Any]] = None
    enabled: bool = True

    @validator("cron_expression")
    def validate_cron_expression(cls, value):
        """Validate that the cron expression is in the correct format."""
        # Very basic validation - could be more sophisticated
        parts = value.split()
        if len(parts) not in (5, 6):
            raise ValueError(
                "Cron expression must have 5 or 6 parts: minute hour day month day_of_week [year]"
            )
        return value


class WorkflowScheduleUpdateSchema(BaseModel):
    """Schema for updating an existing workflow schedule."""

    name: Optional[str] = None
    cron_expression: Optional[str] = None
    initial_inputs: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None

    @validator("cron_expression")
    def validate_cron_expression(cls, value):
        """Validate that the cron expression is in the correct format."""
        if value is None:
            return value

        parts = value.split()
        if len(parts) not in (5, 6):
            raise ValueError(
                "Cron expression must have 5 or 6 parts: minute hour day month day_of_week [year]"
            )
        return value


class WorkflowScheduleResponseSchema(BaseModel):
    """Schema for returning a workflow schedule."""

    id: str
    workflow_id: str
    name: str
    cron_expression: str
    initial_inputs: Optional[Dict[str, Any]] = None
    enabled: bool
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowScheduleListResponseSchema(BaseModel):
    """Schema for returning a list of workflow schedules."""

    schedules: List[WorkflowScheduleResponseSchema]
    total: int
    page: int
    page_size: int

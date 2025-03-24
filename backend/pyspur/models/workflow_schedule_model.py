from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import JSON, Boolean, Computed, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base_model import BaseModel


class WorkflowScheduleModel(BaseModel):
    """Represents a scheduled workflow execution."""

    __tablename__ = "workflow_schedules"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'SS' || _intid"), nullable=False, unique=True)
    workflow_id: Mapped[str] = mapped_column(
        String, ForeignKey("workflows.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    cron_expression: Mapped[str] = mapped_column(String, nullable=False)
    initial_inputs: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now(timezone.utc), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationships
    workflow = relationship("WorkflowModel", back_populates="schedules")

from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Computed,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base_model import BaseModel


class TaskStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
    PAUSED = "PAUSED"


class TaskModel(BaseModel):
    __tablename__ = "tasks"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'T' || _intid"), nullable=False, unique=True)
    run_id: Mapped[str] = mapped_column(String, ForeignKey("runs.id"), nullable=False)
    node_id: Mapped[str] = mapped_column(String, nullable=False)
    parent_task_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("tasks.id"), nullable=True
    )
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus), default=TaskStatus.PENDING, nullable=False
    )
    inputs: Mapped[Any] = mapped_column(JSON, nullable=True)
    outputs: Mapped[Any] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=datetime.now(timezone.utc)
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    subworkflow: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    subworkflow_output: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    # Relationships
    parent_task = relationship("TaskModel", remote_side=[id], back_populates="subtasks")
    subtasks = relationship("TaskModel", back_populates="parent_task", cascade="all, delete-orphan")

    @property
    def run_time(self) -> Optional[float]:
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        elif self.start_time:
            return (datetime.now() - self.start_time).total_seconds()
        else:
            return None

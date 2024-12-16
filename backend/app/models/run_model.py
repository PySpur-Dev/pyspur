from sqlalchemy import (
    Computed,
    Integer,
    ForeignKey,
    Enum,
    JSON,
    DateTime,
    String,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from enum import Enum as PyEnum
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from .base_model import Base
from .task_model import TaskModel
from .output_file_model import OutputFileModel


class RunStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class RunModel(Base):
    __tablename__ = "runs"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(
        String, Computed("'R' || _intid"), nullable=False, index=True
    )
    workflow_id: Mapped[str] = mapped_column(
        String, ForeignKey("workflows.id"), nullable=False, index=True
    )
    workflow_version_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflow_versions._intid"), nullable=False, index=True
    )
    parent_run_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("runs.id"), nullable=True, index=True
    )
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus), default=RunStatus.PENDING, nullable=False
    )
    run_type: Mapped[str] = mapped_column(String, nullable=False)
    initial_inputs: Mapped[Optional[Dict[str, Dict[str, Any]]]] = mapped_column(
        JSON, nullable=True
    )
    input_dataset_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("datasets.id"), nullable=True, index=True
    )
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=datetime.now(timezone.utc)
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    outputs: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    output_file_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("output_files.id"), nullable=True
    )
    tasks: Mapped[List["TaskModel"]] = relationship("TaskModel")
    parent_run: Mapped[Optional["RunModel"]] = relationship(
        "RunModel", remote_side=[id], back_populates="subruns"
    )
    subruns: Mapped[List["RunModel"]] = relationship(
        "RunModel", back_populates="parent_run"
    )
    output_file: Mapped[Optional["OutputFileModel"]] = relationship(
        "OutputFileModel", backref="run"
    )

    @property
    def percentage_complete(self) -> Optional[float]:
        if self.status == RunStatus.PENDING:
            return 0.0
        elif self.status == RunStatus.COMPLETED:
            return 1.0
        elif self.status == RunStatus.FAILED:
            return 0.0
        elif self.initial_inputs:
            return 0.5
        elif self.input_dataset_id:
            # return percentage of subruns completed
            return (
                1.0
                * len(
                    [
                        subrun
                        for subrun in self.subruns
                        if subrun.status == RunStatus.COMPLETED
                    ]
                )
                / (1.0 * len(self.subruns))
            )

from sqlalchemy import (
    Computed,
    Integer,
    String,
    DateTime,
    Enum,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column
from enum import Enum as PyEnum
from datetime import datetime, timezone
from typing import Optional, Any
from .base_model import Base

class EvalRunStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class EvalRunModel(Base):
    __tablename__ = "eval_runs"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(
        String, Computed("'ER' || _intid"), nullable=False, index=True
    )
    eval_name: Mapped[str] = mapped_column(String, nullable=False)
    workflow_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[EvalRunStatus] = mapped_column(
        Enum(EvalRunStatus), default=EvalRunStatus.PENDING, nullable=False
    )
    output_variable: Mapped[str] = mapped_column(String, nullable=False)
    num_samples: Mapped[int] = mapped_column(Integer, default=10)
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=datetime.now(timezone.utc)
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    results: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

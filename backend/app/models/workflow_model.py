from sqlalchemy import Computed, Integer, String, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from typing import Optional, Any
from .base_model import Base


class WorkflowModel(Base):
    """
    Represents a workflow in the system.

    A version of the workflow is created only when the workflow is run.
    The latest or current version of the workflow is always stored in the
    WorkflowModel itself, while specific versions are managed separately.
    """

    __tablename__ = "workflows"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True)
    id: Mapped[str] = mapped_column(
        String, Computed("'S' || _intid"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    definition: Mapped[Any] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    versions = relationship("WorkflowVersionModel", back_populates="workflow")

from datetime import datetime, timezone
from typing import Any, List, Optional

from sqlalchemy import JSON, Computed, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base_model import BaseModel
from .run_model import RunModel


class WorkflowVersionModel(BaseModel):
    __tablename__ = "workflow_versions"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'SV' || _intid"), nullable=False, unique=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    definition: Mapped[Any] = mapped_column(JSON, nullable=False)
    definition_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationships
    workflow = relationship("WorkflowModel", back_populates="versions")

    runs: Mapped[Optional[List["RunModel"]]] = relationship(
        "RunModel", backref="workflow_version", cascade="all, delete-orphan"
    )

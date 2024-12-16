from sqlalchemy import Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from typing import List, Optional, Any
from .base_model import Base
from .run_model import RunModel


class WorkflowVersionModel(Base):
    __tablename__ = "workflow_versions"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    workflow_id: Mapped[int] = mapped_column(
        ForeignKey("workflows.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    definition: Mapped[Any] = mapped_column(JSON, nullable=False)
    definition_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationships
    workflow = relationship("WorkflowModel", back_populates="versions")

    runs: Mapped[Optional[List["RunModel"]]] = relationship(
        "RunModel", backref="workflow_version"
    )

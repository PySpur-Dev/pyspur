from sqlalchemy import Column, String, JSON, ForeignKey, DateTime, Integer, Computed
from sqlalchemy.orm import relationship, Mapped, mapped_column
from datetime import datetime, timezone
from typing import Optional, Any
from .base_model import BaseModel


class WorkflowVersionModel(BaseModel):
    """
    Represents a specific version of a workflow.
    Created when a workflow is run or when explicitly versioned.
    """

    __tablename__ = "workflow_versions"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True)
    id: Mapped[str] = mapped_column(
        String, Computed("'V' || _intid"), nullable=False, index=True
    )
    workflow_id = Column(String, ForeignKey("workflows.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    definition = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.now(timezone.utc))

    # Relationships
    workflow = relationship("WorkflowModel", back_populates="versions")
    spurs = relationship("SpurModel", back_populates="workflow_version")

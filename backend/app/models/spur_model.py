from sqlalchemy import Column, String, JSON, ForeignKey, DateTime, Boolean, Integer
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .base_model import BaseModel
import uuid


def generate_id():
    return str(uuid.uuid4())


class SpurModel(BaseModel):
    __tablename__ = "spurs"

    id = Column(String, primary_key=True, default=generate_id)
    name = Column(String, nullable=False)
    description = Column(String)
    workflow_id = Column(String, ForeignKey("workflows.id"), nullable=False)
    workflow_version_id = Column(String, ForeignKey("workflow_versions.id"))
    api_key = Column(String, nullable=False)  # For API authentication
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True))
    input_schema = Column(JSON)  # API input schema
    output_schema = Column(JSON)  # API output schema
    rate_limit_calls = Column(Integer, default=100)
    rate_limit_period = Column(Integer, default=60)  # in seconds

    workflow = relationship("WorkflowModel", back_populates="spurs")
    workflow_version = relationship("WorkflowVersionModel", back_populates="spurs")

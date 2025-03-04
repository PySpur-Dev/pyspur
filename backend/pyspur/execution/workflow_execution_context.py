from typing import Optional, Dict, Any

from pydantic import BaseModel
from sqlalchemy.orm import Session


class WorkflowExecutionContext(BaseModel):
    """
    Contains the context of a workflow execution.
    """

    workflow_id: str
    run_id: str
    parent_run_id: Optional[str]
    run_type: str
    db_session: Optional[Session] = None
    workflow_definition: Optional[Dict[str, Any]] = None

    class Config:
        arbitrary_types_allowed = True

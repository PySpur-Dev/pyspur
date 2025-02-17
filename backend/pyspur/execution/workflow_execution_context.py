from typing import Optional

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
    db_session: Session

    class Config:
        arbitrary_types_allowed = True

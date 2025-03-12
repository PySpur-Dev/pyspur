from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class MessageBase(BaseModel):
    content: Dict[str, Any]


class MessageResponse(MessageBase):
    id: str
    session_id: str
    run_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {
        "from_attributes": True,
    }


class SessionBase(BaseModel):
    workflow_id: str


class SessionCreate(SessionBase):
    user_id: str
    external_id: Optional[str] = None


class SessionUpdate(SessionBase):
    pass


class SessionResponse(SessionBase):
    id: str
    user_id: str
    workflow_id: str
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse]
    model_config = {
        "from_attributes": True,
    }


class SessionListResponse(BaseModel):
    sessions: List[SessionResponse]
    total: int

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UserBase(BaseModel):
    external_id: str = Field(..., description="External ID for the user")
    user_metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional user metadata"
    )


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    external_id: Optional[str] = Field(None, description="External ID for the user")
    user_metadata: Optional[Dict[str, Any]] = Field(None, description="Additional user metadata")


class UserResponse(UserBase):
    id: str = Field(..., description="Internal ID with prefix (e.g. U1)")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    users: List[UserResponse]
    total: int = Field(..., description="Total number of users")

from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class RateLimitConfig(BaseModel):
    calls: int = 100
    period: int = 60

class SpurCreateSchema(BaseModel):
    name: str
    description: Optional[str] = None
    workflow_id: str
    workflow_version_id: Optional[str] = None
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    rate_limit: Optional[RateLimitConfig] = None

class SpurResponseSchema(BaseModel):
    id: str
    name: str
    description: Optional[str]
    workflow_id: str
    workflow_version_id: Optional[str]
    is_active: bool
    created_at: datetime
    api_key: str
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    rate_limit: RateLimitConfig

    class Config:
        from_attributes = True
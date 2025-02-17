from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FileResponseSchema(BaseModel):
    name: str
    path: str
    size: int
    created: datetime
    workflow_id: Optional[str] = None

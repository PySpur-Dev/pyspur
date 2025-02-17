from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel


class EvalRunRequest(BaseModel):
    workflow_id: str
    eval_name: str
    output_variable: str
    num_samples: int = 10


class EvalRunStatusEnum(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class EvalRunResponse(BaseModel):
    run_id: str
    eval_name: str
    workflow_id: str
    status: EvalRunStatusEnum
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    results: Optional[Dict[str, Any]] = None

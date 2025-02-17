from datetime import datetime

from pydantic import BaseModel


class OutputFileResponseSchema(BaseModel):
    id: str
    file_name: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OutputFileCreateSchema(BaseModel):
    run_id: str
    file_name: str
    file_path: str


class OutputFileUpdateSchema(BaseModel):
    id: str

    class Config:
        from_attributes = True

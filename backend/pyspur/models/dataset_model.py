from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Computed, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base_model import BaseModel


class DatasetModel(BaseModel):
    __tablename__ = "datasets"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'DS' || _intid"), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))

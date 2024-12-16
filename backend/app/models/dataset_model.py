from typing import Optional
from sqlalchemy import Computed, Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from .base_model import Base


class DatasetModel(Base):
    __tablename__ = "datasets"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True)
    id: Mapped[str] = mapped_column(
        String, Computed("'DS' || _intid"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now(timezone.utc)
    )

from sqlalchemy import Computed, Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from .base_model import Base


class OutputFileModel(Base):
    __tablename__ = "output_files"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True)
    id: Mapped[str] = mapped_column(
        String, Computed("'OF' || _intid"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

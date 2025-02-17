from datetime import datetime, timezone

from sqlalchemy import Computed, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base_model import BaseModel


class OutputFileModel(BaseModel):
    __tablename__ = "output_files"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'OF' || _intid"), nullable=False, unique=True)
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    run = relationship(
        "RunModel",
        back_populates="output_file",
        single_parent=True,
        cascade="all, delete-orphan",
    )

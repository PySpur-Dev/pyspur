from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, Computed, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base_model import BaseModel
from .workflow_model import WorkflowModel


class UserModel(BaseModel):
    __tablename__ = "users"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'U' || _intid"), nullable=False, unique=True)
    external_id: Mapped[str] = mapped_column(String, nullable=True, unique=True)
    user_metadata: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationship to sessions, ordered by most recent first
    sessions: Mapped[List["SessionModel"]] = relationship(
        "SessionModel",
        back_populates="user",
        order_by="desc(SessionModel.created_at)",
        cascade="all, delete-orphan",
    )


class SessionModel(BaseModel):
    __tablename__ = "sessions"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'SN' || _intid"), nullable=False, unique=True)
    external_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, unique=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    workflow_id: Mapped[str] = mapped_column(
        String, ForeignKey("workflows.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationship to user
    user: Mapped["UserModel"] = relationship("UserModel", back_populates="sessions")

    # Relationship to workflow
    workflow: Mapped["WorkflowModel"] = relationship("WorkflowModel")

    # Relationship to messages, ordered chronologically
    messages: Mapped[List["MessageModel"]] = relationship(
        "MessageModel",
        back_populates="session",
        order_by="MessageModel.created_at",
        cascade="all, delete-orphan",
    )


class MessageModel(BaseModel):
    __tablename__ = "messages"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'M' || _intid"), nullable=False, unique=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("sessions.id"), nullable=False, index=True
    )
    run_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("runs.id"), nullable=True, index=True
    )
    content: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationship to session
    session: Mapped["SessionModel"] = relationship("SessionModel", back_populates="messages")

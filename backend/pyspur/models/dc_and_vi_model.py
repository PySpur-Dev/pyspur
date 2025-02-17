from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

from sqlalchemy import (
    JSON,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base_model import BaseModel

# Define valid status values
DocumentStatus = Literal["processing", "ready", "error", "deleted"]


class DocumentCollectionModel(BaseModel):
    """Model for document collections."""

    __tablename__ = "document_collections"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'DC' || _intid"), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[DocumentStatus] = mapped_column(String, nullable=False, default="processing")
    document_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(String)

    # Store configuration
    text_processing_config: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        comment="Configuration for text processing including: chunk_token_size, min_chunk_size_chars, etc.",
    )

    # Relationships
    vector_indices: Mapped[list["VectorIndexModel"]] = relationship(
        "VectorIndexModel",
        back_populates="document_collection",
        cascade="all, delete-orphan",
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )


class VectorIndexModel(BaseModel):
    """Model for vector indices."""

    __tablename__ = "vector_indices"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'VI' || _intid"), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[DocumentStatus] = mapped_column(String, nullable=False, default="processing")
    document_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(String)

    # Store configuration
    embedding_config: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        comment="Configuration for embeddings including: model, dimensions, batch_size, etc.",
    )

    # Foreign key to document collection
    collection_id: Mapped[str] = mapped_column(
        String, ForeignKey("document_collections.id"), nullable=False
    )
    document_collection: Mapped[DocumentCollectionModel] = relationship(
        "DocumentCollectionModel", back_populates="vector_indices"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )


class DocumentProcessingProgressModel(BaseModel):
    """Model for tracking processing progress"""

    __tablename__ = "document_processing_progress"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    current_step: Mapped[str] = mapped_column(String, nullable=False, default="initializing")
    total_files: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_files: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_chunks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_chunks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

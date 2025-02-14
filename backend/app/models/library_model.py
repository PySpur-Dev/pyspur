from sqlalchemy import Computed, Integer, String, DateTime, JSON, ForeignKey, Table, Column, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from typing import Optional, Any
from .base_model import BaseModel

# Association table for library items and tags
library_item_tags = Table(
    'library_item_tags',
    BaseModel.metadata,
    Column('library_item_id', String, ForeignKey('library_items.id')),
    Column('tag_id', Integer, ForeignKey('library_tags.id'))
)

class LibraryItemType(str, Enum):
    PROMPT = "prompt"
    SCHEMA = "schema"

class LibraryTag(BaseModel):
    """Tags for organizing library items"""
    __tablename__ = "library_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))

class LibraryCollection(BaseModel):
    """Collections for organizing library items"""
    __tablename__ = "library_collections"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'C' || _intid"), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    parent_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey('library_collections.id'))
    library_id: Mapped[str] = mapped_column(String, ForeignKey('libraries.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    # Relationships
    items = relationship("LibraryItem", back_populates="collection")
    children = relationship("LibraryCollection", backref="parent", remote_side=[id])
    library = relationship("LibraryModel", back_populates="collections")

class LibraryItemVersion(BaseModel):
    """Version history for library items"""
    __tablename__ = "library_item_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[str] = mapped_column(String, ForeignKey('library_items.id'), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[Any] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))

    # Relationships
    item = relationship("LibraryItem", back_populates="versions")

class LibraryItem(BaseModel):
    """Base model for library items (prompts and schemas)"""
    __tablename__ = "library_items"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'L' || _intid"), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    type: Mapped[LibraryItemType] = mapped_column(String, nullable=False)
    content: Mapped[Any] = mapped_column(JSON, nullable=False)  # Store prompt text or JSON schema
    collection_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey('library_collections.id'))
    library_id: Mapped[str] = mapped_column(String, ForeignKey('libraries.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    # Relationships
    collection = relationship("LibraryCollection", back_populates="items")
    library = relationship("LibraryModel", back_populates="items")
    tags = relationship("LibraryTag", secondary=library_item_tags)
    versions = relationship("LibraryItemVersion", back_populates="item", cascade="all, delete-orphan")

class LibraryModel(BaseModel):
    """Main model for the library system"""
    __tablename__ = "libraries"

    _intid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement="auto")
    id: Mapped[str] = mapped_column(String, Computed("'LIB' || _intid"), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    # Relationships
    collections = relationship("LibraryCollection", back_populates="library", cascade="all, delete-orphan")
    items = relationship("LibraryItem", back_populates="library", cascade="all, delete-orphan")

    class Config:
        from_attributes = True
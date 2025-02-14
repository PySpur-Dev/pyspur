from datetime import datetime
from typing import List, Optional, Any, Union
from pydantic import BaseModel, field_validator
from enum import Enum

class LibraryItemType(str, Enum):
    PROMPT = "prompt"
    SCHEMA = "schema"

class TagSchema(BaseModel):
    """Schema for tags"""
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class CollectionCreateSchema(BaseModel):
    """Schema for creating a collection"""
    name: str
    description: Optional[str] = None
    parent_id: Optional[str] = None

class CollectionResponseSchema(BaseModel):
    """Schema for collection responses"""
    id: str
    name: str
    description: Optional[str]
    parent_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class LibraryItemCreateSchema(BaseModel):
    """Schema for creating library items"""
    name: str
    description: Optional[str] = None
    type: LibraryItemType
    content: Any  # JSON schema or prompt text
    collection_id: Optional[str] = None
    tag_ids: List[int] = []

    @field_validator('content')
    def validate_content(cls, v, values):
        item_type = values.data.get('type')
        if item_type == LibraryItemType.SCHEMA:
            if not isinstance(v, dict):
                raise ValueError("Schema content must be a valid JSON object")
        elif item_type == LibraryItemType.PROMPT:
            if not isinstance(v, str):
                raise ValueError("Prompt content must be a string")
        return v

class LibraryItemUpdateSchema(BaseModel):
    """Schema for updating library items"""
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[Any] = None
    collection_id: Optional[str] = None
    tag_ids: Optional[List[int]] = None

class LibraryItemVersionSchema(BaseModel):
    """Schema for item versions"""
    id: int
    version: int
    content: Any
    created_at: datetime

    class Config:
        from_attributes = True

class LibraryItemResponseSchema(BaseModel):
    """Schema for library item responses"""
    id: str
    name: str
    description: Optional[str]
    type: LibraryItemType
    content: Any
    collection_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    tags: List[TagSchema]
    versions: List[LibraryItemVersionSchema]

    class Config:
        from_attributes = True

class LibrarySearchParams(BaseModel):
    """Schema for search parameters"""
    query: Optional[str] = None
    type: Optional[LibraryItemType] = None
    collection_id: Optional[str] = None
    tag_ids: Optional[List[int]] = None
    page: int = 1
    page_size: int = 10
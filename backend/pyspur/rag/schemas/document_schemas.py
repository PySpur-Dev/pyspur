from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class Source(str, Enum):
    file = "file"
    url = "url"
    text = "text"


class DocumentMetadataSchema(BaseModel):
    """Metadata for a document."""

    source: Source = Source.text
    source_id: Optional[str] = None
    created_at: Optional[str] = None
    author: Optional[str] = None
    title: Optional[str] = None
    custom_metadata: Optional[Dict[str, str]] = None


class DocumentChunkMetadataSchema(DocumentMetadataSchema):
    """Metadata for a document chunk."""

    document_id: Optional[str] = None
    chunk_index: Optional[int] = None
    custom_metadata: Optional[Dict[str, str]] = Field(default_factory=dict)


class DocumentSchema(BaseModel):
    """A document with its metadata."""

    id: Optional[str] = None
    text: str
    metadata: Optional[DocumentMetadataSchema] = None


class DocumentChunkSchema(BaseModel):
    """A chunk of a document with its metadata and embedding."""

    id: str
    text: str
    metadata: DocumentChunkMetadataSchema
    embedding: Optional[List[float]] = None


class DocumentChunkWithScoreSchema(DocumentChunkSchema):
    score: float


class DocumentWithChunksSchema(DocumentSchema):
    """A document with its chunks."""

    chunks: List[DocumentChunkSchema] = Field(default_factory=list)


class DocumentMetadataFilterSchema(BaseModel):
    document_id: Optional[str] = None
    source: Optional[Source] = None
    source_id: Optional[str] = None
    author: Optional[str] = None
    start_date: Optional[str] = None  # any date string format
    end_date: Optional[str] = None  # any date string format


class ChunkTemplateSchema(BaseModel):
    """Configuration for chunk templates."""

    enabled: bool = False
    template: str = "{{ text }}"  # Default template just shows the text
    metadata_template: Optional[Dict[str, str]] = Field(
        default_factory=lambda: {"type": "text_chunk"}
    )


class ChunkingConfigSchema(BaseModel):
    """Configuration for text chunking."""

    chunk_token_size: int = 200
    min_chunk_size_chars: int = 350
    min_chunk_length_to_embed: int = 5
    embeddings_batch_size: int = 128
    max_num_chunks: int = 10000
    template: ChunkTemplateSchema = Field(default_factory=ChunkTemplateSchema)


class QuerySchema(BaseModel):
    query: str
    filter: Optional[DocumentMetadataFilterSchema] = None
    top_k: Optional[int] = 3


class QueryWithEmbeddingSchema(QuerySchema):
    embedding: List[float]


class QueryResultSchema(BaseModel):
    query: str
    results: List[DocumentChunkWithScoreSchema]

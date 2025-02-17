import os
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel


class TemplateSchema(BaseModel):
    enabled: bool = False
    template: str = "{{ text }}"
    metadata_template: Dict[str, str] = {}


# Models
class TextProcessingConfigSchema(BaseModel):
    chunk_token_size: int = 200  # Default value from original chunker
    min_chunk_size_chars: int = 350  # Default value from original chunker
    min_chunk_length_to_embed: int = 5  # Default value from original chunker
    embeddings_batch_size: int = 128  # Default value from original chunker
    max_num_chunks: int = 10000  # Default value from original chunker
    use_vision_model: bool = False  # Whether to use vision model for PDF parsing
    vision_model: Optional[str] = None  # Model to use for vision-based parsing
    vision_provider: Optional[str] = None  # Provider for vision model
    template: Optional[TemplateSchema] = TemplateSchema()

    def get_vision_config(self) -> Optional[Dict[str, Any]]:
        """Get vision configuration with API key if vision model is enabled."""
        if not self.use_vision_model or not self.vision_model or not self.vision_provider:
            return None

        # Get API key based on provider
        api_key = None
        if self.vision_provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
        elif self.vision_provider == "anthropic":
            api_key = os.getenv("ANTHROPIC_API_KEY")

        if not api_key:
            raise HTTPException(
                status_code=400,
                detail=f"Missing API key for vision provider {self.vision_provider}",
            )

        return {
            "model": self.vision_model,
            "provider": self.vision_provider,
            "api_key": api_key,
        }


class EmbeddingConfigSchema(BaseModel):
    model: str
    vector_db: str
    search_strategy: str
    semantic_weight: Optional[float] = None
    keyword_weight: Optional[float] = None
    top_k: Optional[int] = None
    score_threshold: Optional[float] = None


class DocumentCollectionCreateSchema(BaseModel):
    """Request model for creating a document collection"""

    name: str
    description: Optional[str] = None
    text_processing: TextProcessingConfigSchema


class VectorIndexCreateSchema(BaseModel):
    """Request model for creating a vector index"""

    name: str
    description: Optional[str] = None
    collection_id: str
    embedding: EmbeddingConfigSchema


class DocumentCollectionResponseSchema(BaseModel):
    """Response model for document collection operations"""

    id: str
    name: str
    description: Optional[str] = None
    status: str
    created_at: str
    updated_at: str
    document_count: int
    chunk_count: int
    error_message: Optional[str] = None


class VectorIndexResponseSchema(BaseModel):
    """Response model for vector index operations"""

    id: str
    name: str
    description: Optional[str] = None
    collection_id: str
    status: str
    created_at: str
    updated_at: str
    document_count: int
    chunk_count: int
    error_message: Optional[str] = None
    embedding_model: str
    vector_db: str


# Progress tracking models
class ProcessingProgressSchema(BaseModel):
    """Base model for tracking processing progress"""

    id: str
    status: str = "pending"  # pending, processing, completed, failed
    progress: float = 0.0  # 0 to 1
    current_step: str = "initializing"  # parsing, chunking, embedding, etc.
    total_files: int = 0
    processed_files: int = 0
    total_chunks: int = 0
    processed_chunks: int = 0
    error_message: Optional[str] = None
    created_at: str
    updated_at: str


class RetrievalRequestSchema(BaseModel):
    """Request model for retrieving from vector index"""

    query: str
    top_k: Optional[int] = 5
    score_threshold: Optional[float] = None
    semantic_weight: Optional[float] = 1.0
    keyword_weight: Optional[float] = None


class ChunkMetadataSchema(BaseModel):
    """Schema for chunk metadata in retrieval response"""

    document_id: str
    chunk_id: str
    document_title: Optional[str] = None
    page_number: Optional[int] = None
    chunk_number: Optional[int] = None


class RetrievalResultSchema(BaseModel):
    """Schema for a single retrieval result"""

    text: str
    score: float
    metadata: ChunkMetadataSchema


class RetrievalResponseSchema(BaseModel):
    """Response model for retrieval operations"""

    results: List[RetrievalResultSchema]
    total_results: int

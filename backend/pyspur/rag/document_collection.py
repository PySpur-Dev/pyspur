import json
import uuid
from pathlib import Path
from typing import Any, Callable, Coroutine, Dict, List, Optional

import arrow
from loguru import logger

from .chunker import ChunkingConfigSchema, create_document_chunks
from .parser import extract_text_from_file
from .schemas.document_schemas import (
    DocumentChunkSchema,
    DocumentMetadataSchema,
    DocumentSchema,
    DocumentWithChunksSchema,
    Source,
)


class DocumentStore:
    """Manages document storage, parsing and chunking."""

    def __init__(self, kb_id: str):
        """Initialize document store for a knowledge base."""
        self.kb_id = kb_id
        self.base_dir = Path(f"data/knowledge_bases/{kb_id}")
        self.raw_dir = self.base_dir / "raw"
        self.chunks_dir = self.base_dir / "chunks"

        # Create directory structure
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.raw_dir.mkdir(exist_ok=True)
        self.chunks_dir.mkdir(exist_ok=True)

    async def process_documents(
        self,
        files: List[Dict[str, Any]],
        config: Dict[str, Any],
        on_progress: Optional[Callable[[float, str, int, int], Coroutine[Any, Any, None]]] = None,
    ) -> List[DocumentWithChunksSchema]:
        """
        Process documents through parsing and chunking.

        Args:
            files: List of file information (path, type, etc.)
            config: Configuration for processing
            on_progress: Async callback for progress updates

        Returns:
            List[DocumentWithChunks]: Processed documents with their chunks
        """
        try:
            # Initialize progress
            if on_progress:
                await on_progress(0.0, "parsing", 0, len(files))

            # Get vision configuration if enabled
            vision_config = None
            if config.get("use_vision_model", False):
                vision_config = {
                    "model": config.get("vision_model"),
                    "provider": config.get("vision_provider"),
                    "api_key": config.get("api_key"),
                }

            # 1. Parse documents
            documents: List[DocumentSchema] = []
            for i, file_info in enumerate(files):
                logger.debug(f"Parsing file {i + 1}/{len(files)}: {file_info.get('path')}")
                file_path = Path(file_info["path"])

                # Create document metadata
                metadata = DocumentMetadataSchema(
                    source=Source.file,
                    source_id=file_path.name,
                    created_at=arrow.utcnow().isoformat(),
                    author=file_info.get("author"),
                )

                # Extract text with vision model if enabled and file is PDF
                with open(file_path, "rb") as f:
                    text = extract_text_from_file(
                        f,
                        file_info["mime_type"],
                        vision_config if file_info["mime_type"] == "application/pdf" else None,
                    )

                # Save raw text
                doc_id = str(uuid.uuid4())
                raw_path = self.raw_dir / f"{doc_id}.txt"
                raw_path.write_text(text)

                # Create document
                doc = DocumentSchema(id=doc_id, text=text, metadata=metadata)
                documents.append(doc)

                if on_progress:
                    await on_progress(
                        (i + 1) / len(files) * 0.5,  # First 50% for parsing
                        "parsing",
                        i + 1,
                        len(files),
                    )

            # 2. Create chunks
            chunking_config = ChunkingConfigSchema(
                chunk_token_size=config.get("chunk_token_size", 200),
                min_chunk_size_chars=config.get("min_chunk_size_chars", 350),
                min_chunk_length_to_embed=config.get("min_chunk_length_to_embed", 5),
                embeddings_batch_size=config.get("embeddings_batch_size", 128),
                max_num_chunks=config.get("max_num_chunks", 10000),
                template=config.get("template", {}),
            )

            docs_with_chunks: List[DocumentWithChunksSchema] = []

            for i, doc in enumerate(documents):
                # Create chunks
                doc_chunks, doc_id = create_document_chunks(doc, chunking_config)

                # Save chunks
                chunks_path = self.chunks_dir / f"{doc_id}.json"
                with open(chunks_path, "w") as f:
                    json.dump(
                        [chunk.model_dump() for chunk in doc_chunks],
                        f,
                        indent=2,
                    )

                # Create DocumentWithChunks
                doc_with_chunks = DocumentWithChunksSchema(
                    id=doc_id,
                    text=doc.text,
                    metadata=doc.metadata,
                    chunks=doc_chunks,
                )
                docs_with_chunks.append(doc_with_chunks)

                if on_progress:
                    await on_progress(
                        0.5 + (i + 1) / len(documents) * 0.5,  # Last 50% for chunking
                        "chunking",
                        i + 1,
                        len(documents),
                    )

            return docs_with_chunks

        except Exception as e:
            logger.error(f"Error processing documents: {e}")
            raise

    def get_document(self, doc_id: str) -> Optional[DocumentWithChunksSchema]:
        """Retrieve a document and its chunks from storage."""
        try:
            # Read raw text
            raw_path = self.raw_dir / f"{doc_id}.txt"
            if not raw_path.exists():
                return None

            text = raw_path.read_text()

            # Read chunks
            chunks_path = self.chunks_dir / f"{doc_id}.json"
            if not chunks_path.exists():
                return None

            with open(chunks_path) as f:
                chunks_data = json.load(f)
                chunks = [DocumentChunkSchema(**chunk_data) for chunk_data in chunks_data]

            # Create DocumentWithChunks
            return DocumentWithChunksSchema(id=doc_id, text=text, chunks=chunks)

        except Exception as e:
            logger.error(f"Error retrieving document {doc_id}: {e}")
            return None

    def list_documents(self) -> List[str]:
        """List all document IDs in the store."""
        try:
            return [p.stem for p in self.raw_dir.glob("*.txt")]
        except Exception as e:
            logger.error(f"Error listing documents: {e}")
            return []

    def delete_document(self, doc_id: str) -> bool:
        """Delete a document and its chunks from storage."""
        try:
            raw_path = self.raw_dir / f"{doc_id}.txt"
            chunks_path = self.chunks_dir / f"{doc_id}.json"

            if raw_path.exists():
                raw_path.unlink()
            if chunks_path.exists():
                chunks_path.unlink()

            return True
        except Exception as e:
            logger.error(f"Error deleting document {doc_id}: {e}")
            return False

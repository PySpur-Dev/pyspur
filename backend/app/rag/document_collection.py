from pathlib import Path
import json
import uuid
from typing import List, Dict, Any, Optional, Callable, Awaitable
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy.orm import Session

from .parser import extract_text_from_file
from .chunker import ChunkingConfigSchema, create_document_chunks
from .schemas.document_schemas import (
    DocumentWithChunksSchema,
    DocumentChunkSchema,
)
from ..models.task_model import TaskModel, TaskStatus, TaskType

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

    def store_document(self, doc: DocumentWithChunksSchema) -> None:
        """Store a document and its chunks."""
        # Save raw text
        raw_path = self.raw_dir / f"{doc.id}.txt"
        raw_path.write_text(doc.text)

        # Save chunks
        if doc.chunks:
            chunks_path = self.chunks_dir / f"{doc.id}.json"
            with open(chunks_path, "w") as f:
                json.dump([chunk.model_dump() for chunk in doc.chunks], f, indent=2)

    async def process_documents(
        self,
        file_infos: List[Dict[str, Any]],
        config: Dict[str, Any],
        task_id: str,
        db: Session,
    ) -> None:
        """Process documents and store them in the document store"""
        task = None  # Initialize task to None
        try:
            # Get task from database
            task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
            if not task:
                raise ValueError(f"Task {task_id} not found")

            # Update task status
            task.status = TaskStatus.RUNNING
            task.start_time = datetime.now(timezone.utc)
            db.commit()

            # Get vision model config if enabled
            vision_config = None
            if config.get("use_vision_model"):
                vision_config = {
                    "model": config.get("vision_model", "gpt-4o-mini"),
                    "provider": config.get("vision_provider", "openai"),
                    "api_key": config.get("api_key"),
                    "system_prompt": config.get("system_prompt"),
                }

            # Process each file
            total_files = len(file_infos)
            processed_chunks = 0
            total_chunks = 0

            for i, file_info in enumerate(file_infos, 1):
                logger.debug(f"Parsing file {i}/{total_files}: {file_info['path']}")

                # Update task progress for parsing
                task.progress = int((i - 1) / total_files * 50)  # First 50% for parsing
                task.current_step = f"Parsing file {i}/{total_files}"
                db.commit()

                # Extract text from file
                with open(file_info["path"], "rb") as file:
                    try:
                        text = await extract_text_from_file(file, file_info["mime_type"], vision_config)
                    except Exception as e:
                        logger.error(f"Error extracting text from file: {e}")
                        task.status = TaskStatus.FAILED
                        task.error = str(e)
                        task.end_time = datetime.now(timezone.utc)
                        db.commit()
                        raise

                # Create document
                doc = DocumentWithChunksSchema(
                    id=str(uuid.uuid4()),
                    text=text,
                    chunks=[],
                    metadata={
                        "mime_type": file_info["mime_type"],
                        "filename": file_info["name"],
                    },
                )

                # Chunk document
                chunking_config = ChunkingConfigSchema(
                    chunk_token_size=config.get("chunk_token_size", 1000),
                    min_chunk_size_chars=config.get("min_chunk_size_chars", 100),
                    template=config.get("template", None),
                )

                doc_chunks, _ = await create_document_chunks(doc, chunking_config)
                doc.chunks = doc_chunks
                processed_chunks += len(doc_chunks)
                total_chunks = processed_chunks  # For single-pass processing

                # Store document
                self.store_document(doc)

                # Update task progress for chunking
                task.progress = int(50 + (i / total_files * 50))  # Last 50% for chunking
                task.current_step = f"Processing chunks ({processed_chunks} chunks created)"
                db.commit()

            # Mark task as completed
            task.status = TaskStatus.COMPLETED
            task.progress = 100
            task.current_step = f"Completed processing {total_files} files ({total_chunks} chunks created)"
            task.end_time = datetime.now(timezone.utc)
            task.outputs = {
                "total_files": total_files,
                "total_chunks": total_chunks,
                "files_processed": [f["name"] for f in file_infos]
            }
            db.commit()

        except Exception as e:
            logger.error(f"Error processing documents: {e}")
            if task and not task.status == TaskStatus.FAILED:  # Check if not already marked as failed
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.end_time = datetime.now(timezone.utc)
                db.commit()
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
            return DocumentWithChunksSchema(
                id=doc_id,
                text=text,
                chunks=chunks
            )

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
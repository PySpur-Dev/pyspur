import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, cast

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from loguru import logger
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.dc_and_vi_model import (
    DocumentCollectionModel,
    DocumentProcessingProgressModel,
    DocumentStatus,
    VectorIndexModel,
)
from ..rag.chunker import preview_document_chunk
from ..rag.document_collection import DocumentStore
from ..rag.schemas.document_schemas import (
    ChunkingConfigSchema,
    DocumentWithChunksSchema,
)
from ..rag.vector_index import VectorIndex
from ..schemas.rag_schemas import (
    ChunkMetadataSchema,
    DocumentCollectionCreateSchema,
    DocumentCollectionResponseSchema,
    ProcessingProgressSchema,
    RetrievalRequestSchema,
    RetrievalResponseSchema,
    RetrievalResultSchema,
    VectorIndexCreateSchema,
    VectorIndexResponseSchema,
)

# In-memory progress tracking (replace with database in production)
collection_progress: Dict[str, ProcessingProgressSchema] = {}
index_progress: Dict[str, ProcessingProgressSchema] = {}


async def update_collection_progress(
    collection_id: str,
    status: Optional[str] = None,
    progress: Optional[float] = None,
    current_step: Optional[str] = None,
    processed_files: Optional[int] = None,
    total_chunks: Optional[int] = None,
    processed_chunks: Optional[int] = None,
    error_message: Optional[str] = None,
    db: Optional[Session] = None,
) -> None:
    """Update document collection processing progress."""
    if collection_id not in collection_progress:
        now = datetime.now(timezone.utc).isoformat()
        collection_progress[collection_id] = ProcessingProgressSchema(
            id=collection_id,
            created_at=now,
            updated_at=now,
        )

    progress_obj = collection_progress[collection_id]
    if status:
        progress_obj.status = status
        # Update collection status in database
        if db is not None:
            collection = (
                db.query(DocumentCollectionModel)
                .filter(DocumentCollectionModel.id == collection_id)
                .first()
            )
            if collection:
                new_status = cast(DocumentStatus, "ready" if status == "completed" else status)
                collection.status = new_status
                if error_message:
                    collection.error_message = error_message
                if processed_chunks and total_chunks:
                    collection.chunk_count = processed_chunks
                if processed_files:
                    collection.document_count = processed_files
                db.commit()

    if progress is not None:
        progress_obj.progress = progress
    if current_step:
        progress_obj.current_step = current_step
    if processed_files is not None:
        progress_obj.processed_files = processed_files
    if total_chunks is not None:
        progress_obj.total_chunks = total_chunks
    if processed_chunks is not None:
        progress_obj.processed_chunks = processed_chunks
    if error_message:
        progress_obj.error_message = error_message

    progress_obj.updated_at = datetime.now(timezone.utc).isoformat()


async def update_index_progress(
    index_id: str,
    status: Optional[str] = None,
    progress: Optional[float] = None,
    current_step: Optional[str] = None,
    total_chunks: Optional[int] = None,
    processed_chunks: Optional[int] = None,
    error_message: Optional[str] = None,
    db: Optional[Session] = None,
) -> None:
    """Update vector index processing progress."""
    if not db:
        return

    # Get or create progress record
    progress_record = (
        db.query(DocumentProcessingProgressModel)
        .filter(DocumentProcessingProgressModel.id == index_id)
        .first()
    )

    if not progress_record:
        now = datetime.now(timezone.utc)
        # Create a dictionary of values to initialize the model
        values: Dict[str, Any] = {
            "id": index_id,
            "created_at": now,
            "updated_at": now,
            "status": status or "processing",
            "progress": float(progress or 0.0),
            "current_step": current_step or "",
            "total_chunks": int(total_chunks or 0),
            "processed_chunks": int(processed_chunks or 0),
            "error_message": error_message,
        }
        progress_record = DocumentProcessingProgressModel(**values)
        db.add(progress_record)
    else:
        # Update fields using setattr to handle SQLAlchemy types
        if status:
            progress_record.status = status
            # Update index status in database
            index = db.query(VectorIndexModel).filter(VectorIndexModel.id == index_id).first()
            if index:
                new_status = cast(DocumentStatus, "ready" if status == "completed" else status)
                index.status = new_status
                if error_message:
                    index.error_message = error_message
                if processed_chunks:
                    index.chunk_count = int(processed_chunks)

        if progress is not None:
            progress_record.progress = float(progress)
        if current_step:
            progress_record.current_step = current_step
        if total_chunks is not None:
            progress_record.total_chunks = int(total_chunks)
        if processed_chunks is not None:
            progress_record.processed_chunks = int(processed_chunks)
        if error_message:
            progress_record.error_message = error_message

        progress_record.updated_at = datetime.now(timezone.utc)

    db.commit()


async def update_index_status(index_id: str, status: str, db: Session) -> None:
    """Update vector index status in database."""
    try:
        index = db.query(VectorIndexModel).filter(VectorIndexModel.id == index_id).first()
        if index:
            # Convert string status to DocumentStatus enum
            new_status = cast(
                DocumentStatus,
                "ready" if status == "ready" else "failed" if status == "failed" else "processing",
            )
            index.status = new_status
            index.updated_at = datetime.now(timezone.utc)
            db.commit()
    except Exception as e:
        logger.error(f"Error updating index status: {e}")


async def process_vector_index_creation(
    index_id: str,
    docs_with_chunks: List[DocumentWithChunksSchema],
    config: Dict[str, Any],
    db: Session,
) -> None:
    """Process vector index creation in background."""
    try:
        vector_index = VectorIndex(index_id)
        await vector_index.create_from_document_collection(
            docs_with_chunks,
            config,
            lambda p, s, pc, tc: update_index_progress(
                index_id,
                progress=p,
                current_step=s,
                processed_chunks=pc,
                total_chunks=tc,
                db=db,
            ),
        )
        # Update index status to ready on successful completion
        await update_index_status(index_id, "ready", db)
    except Exception as e:
        logger.error(f"Error processing vector index: {e}")
        await update_index_status(index_id, "failed", db)
        await update_index_progress(index_id, status="failed", error_message=str(e), db=db)


async def update_collection_status(collection_id: str, status: str, db: Session) -> None:
    """Update document collection status in database."""
    try:
        collection = (
            db.query(DocumentCollectionModel)
            .filter(DocumentCollectionModel.id == collection_id)
            .first()
        )
        if collection:
            # Convert string status to DocumentStatus enum
            new_status = cast(
                DocumentStatus,
                "ready" if status == "ready" else "failed" if status == "failed" else "processing",
            )
            collection.status = new_status
            collection.updated_at = datetime.now(timezone.utc)
            db.commit()
    except Exception as e:
        logger.error(f"Error updating collection status: {e}")


async def process_document_collection(
    collection_id: str,
    file_infos: List[Dict[str, Any]],
    config: Dict[str, Any],
    db: Session,
) -> None:
    """Process document collection in background."""
    try:
        doc_store = DocumentStore(collection_id)

        # Create progress callback
        async def progress_callback(progress: float, step: str, processed: int, total: int) -> None:
            await update_collection_progress(
                collection_id,
                progress=progress,
                current_step=step,
                processed_files=processed if step == "parsing" else None,
                processed_chunks=processed if step == "chunking" else None,
                total_chunks=total if step == "chunking" else None,
                db=db,
            )

        await doc_store.process_documents(
            file_infos,
            config,
            progress_callback,
        )
        # Update collection status to ready on successful completion
        await update_collection_status(collection_id, "ready", db)
    except Exception as e:
        logger.error(f"Error processing document collection: {e}")
        await update_collection_status(collection_id, "failed", db)
        await update_collection_progress(
            collection_id, status="failed", error_message=str(e), db=db
        )


router = APIRouter()


@router.post(
    "/collections/",
    response_model=DocumentCollectionResponseSchema,
    description="Create a new document collection from uploaded files and metadata",
)
async def create_document_collection(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(None),
    metadata: str = Form(...),
    db: Session = Depends(get_db),
):
    """Create a new document collection."""
    try:
        # Parse metadata
        metadata_dict = json.loads(metadata)
        collection_config = DocumentCollectionCreateSchema(**metadata_dict)

        # Validate vision model configuration if enabled
        if collection_config.text_processing.use_vision_model:
            vision_config = collection_config.text_processing.get_vision_config()
            if not vision_config:
                raise HTTPException(
                    status_code=400, detail="Invalid vision model configuration"
                ) from None

        # Get current timestamp
        now = datetime.now(timezone.utc)

        # Create document collection record
        collection = DocumentCollectionModel(
            name=collection_config.name,
            description=collection_config.description,
            status="ready" if not files else "processing",
            document_count=len(files) if files else 0,
            chunk_count=0,
            text_processing_config=collection_config.text_processing.model_dump(),
            created_at=now,
            updated_at=now,
        )
        db.add(collection)
        db.commit()
        db.refresh(collection)

        # Process files if present
        if files:
            # Read files and prepare file info
            file_infos: List[Dict[str, Any]] = []
            collection_dir = Path(f"data/knowledge_bases/{collection.id}")
            collection_dir.mkdir(parents=True, exist_ok=True)

            for file in files:
                if file.filename:
                    file_path = collection_dir / file.filename
                    content = await file.read()
                    with open(file_path, "wb") as f:
                        f.write(content)
                    file_infos.append(
                        {
                            "path": str(file_path),
                            "mime_type": file.content_type,
                            "name": file.filename,
                        }
                    )

            # Start background processing with new function
            background_tasks.add_task(
                process_document_collection,
                collection.id,
                file_infos,
                collection_config.text_processing.model_dump(),
                db,
            )

        # Create response
        return DocumentCollectionResponseSchema(
            id=collection.id,
            name=collection.name,
            description=collection.description,
            status=collection.status,
            created_at=collection.created_at.isoformat(),
            updated_at=collection.updated_at.isoformat(),
            document_count=collection.document_count,
            chunk_count=collection.chunk_count,
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post(
    "/indices/",
    response_model=VectorIndexResponseSchema,
    description="Create a new vector index from a document collection",
)
async def create_vector_index(
    background_tasks: BackgroundTasks,
    index_config: VectorIndexCreateSchema,
    db: Session = Depends(get_db),
):
    """Create a new vector index from a document collection."""
    try:
        # Check if collection exists
        collection = (
            db.query(DocumentCollectionModel)
            .filter(DocumentCollectionModel.id == index_config.collection_id)
            .first()
        )
        if not collection:
            raise HTTPException(status_code=404, detail="Document collection not found") from None

        # Create vector index record
        now = datetime.now(timezone.utc)
        index = VectorIndexModel(
            name=index_config.name,
            description=index_config.description,
            status="processing",
            document_count=collection.document_count,
            chunk_count=collection.chunk_count,
            embedding_config=index_config.embedding.model_dump(),
            collection_id=collection.id,
            created_at=now,
            updated_at=now,
        )
        db.add(index)
        db.commit()
        db.refresh(index)

        # Initialize progress tracking in database
        progress_record = DocumentProcessingProgressModel(
            id=index.id,
            status="processing",
            progress=0.0,
            current_step="initializing",
            total_files=int(collection.document_count),
            processed_files=0,
            total_chunks=int(collection.chunk_count),
            processed_chunks=0,
            created_at=now,
            updated_at=now,
        )
        db.add(progress_record)
        db.commit()
        logger.debug(f"Initialized progress tracking for index {index.id}")

        # Get documents with chunks
        doc_store = DocumentStore(collection.id)
        docs_with_chunks: List[DocumentWithChunksSchema] = []
        for doc_id in doc_store.list_documents():
            doc = doc_store.get_document(doc_id)
            if doc:
                docs_with_chunks.append(doc)

        # Start background processing with new function
        background_tasks.add_task(
            process_vector_index_creation,
            index.id,
            docs_with_chunks,
            index_config.embedding.model_dump(),
            db,
        )

        # Create response
        return VectorIndexResponseSchema(
            id=index.id,
            name=index.name,
            description=index.description,
            collection_id=index.collection_id,
            status=index.status,
            created_at=index.created_at.isoformat(),
            updated_at=index.updated_at.isoformat(),
            document_count=index.document_count,
            chunk_count=index.chunk_count,
            embedding_model=index_config.embedding.model,
            vector_db=index_config.embedding.vector_db,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete(
    "/indices/{index_id}/",
    description="Delete a vector index and its associated data",
)
async def delete_vector_index(index_id: str, db: Session = Depends(get_db)):
    """Delete a vector index."""
    try:
        # Get the vector index from the database
        index = db.query(VectorIndexModel).filter(VectorIndexModel.id == index_id).first()
        if not index:
            raise HTTPException(status_code=404, detail="Vector index not found") from None

        # Delete from vector store and filesystem
        vector_index = VectorIndex(index.id)
        success = await vector_index.delete()
        if not success:
            raise HTTPException(
                status_code=500, detail="Failed to delete vector index data"
            ) from None

        # Remove from tracking database
        db.delete(index)
        db.commit()

        return {"message": "Vector index deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get(
    "/collections/",
    response_model=List[DocumentCollectionResponseSchema],
    description="List all document collections",
)
async def list_document_collections(db: Session = Depends(get_db)):
    """List all document collections."""
    try:
        collections = db.query(DocumentCollectionModel).all()
        return [
            DocumentCollectionResponseSchema(
                id=collection.id,
                name=collection.name,
                description=collection.description,
                status=collection.status,
                created_at=collection.created_at.isoformat(),
                updated_at=collection.updated_at.isoformat(),
                document_count=collection.document_count,
                chunk_count=collection.chunk_count,
                error_message=collection.error_message,
            )
            for collection in collections
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get(
    "/collections/{collection_id}/",
    response_model=DocumentCollectionResponseSchema,
)
async def get_document_collection(collection_id: str, db: Session = Depends(get_db)):
    """Get document collection details."""
    try:
        collection = (
            db.query(DocumentCollectionModel)
            .filter(DocumentCollectionModel.id == collection_id)
            .first()
        )
        if not collection:
            raise HTTPException(status_code=404, detail="Document collection not found") from None

        return DocumentCollectionResponseSchema(
            id=collection.id,
            name=collection.name,
            description=collection.description,
            status=collection.status,
            created_at=collection.created_at.isoformat(),
            updated_at=collection.updated_at.isoformat(),
            document_count=collection.document_count,
            chunk_count=collection.chunk_count,
            error_message=collection.error_message,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete(
    "/collections/{collection_id}/",
    description="Delete a document collection and its associated data",
)
async def delete_document_collection(collection_id: str, db: Session = Depends(get_db)):
    """Delete a document collection."""
    try:
        # Get the document collection from the database
        collection = (
            db.query(DocumentCollectionModel)
            .filter(DocumentCollectionModel.id == collection_id)
            .first()
        )
        if not collection:
            raise HTTPException(status_code=404, detail="Document collection not found") from None

        # Delete files from filesystem
        collection_dir = Path(f"data/knowledge_bases/{collection_id}")
        if collection_dir.exists():
            import shutil

            shutil.rmtree(collection_dir)

        # Remove from tracking database
        db.delete(collection)
        db.commit()

        return {"message": "Document collection deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get(
    "/indices/",
    response_model=List[VectorIndexResponseSchema],
    description="List all vector indices",
)
async def list_vector_indices(db: Session = Depends(get_db)):
    """List all vector indices."""
    try:
        indices = db.query(VectorIndexModel).all()
        return [
            VectorIndexResponseSchema(
                id=index.id,
                name=index.name,
                description=index.description,
                collection_id=index.collection_id,
                status=index.status,
                created_at=index.created_at.isoformat(),
                updated_at=index.updated_at.isoformat(),
                document_count=index.document_count,
                chunk_count=index.chunk_count,
                error_message=index.error_message,
                embedding_model=index.embedding_config["model"],
                vector_db=index.embedding_config["vector_db"],
            )
            for index in indices
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get(
    "/indices/{index_id}/",
    response_model=VectorIndexResponseSchema,
    description="Get details of a specific vector index",
)
async def get_vector_index(index_id: str, db: Session = Depends(get_db)):
    """Get vector index details."""
    try:
        index = db.query(VectorIndexModel).filter(VectorIndexModel.id == index_id).first()
        if not index:
            raise HTTPException(status_code=404, detail="Vector index not found") from None

        return VectorIndexResponseSchema(
            id=index.id,
            name=index.name,
            description=index.description,
            collection_id=index.collection_id,
            status=index.status,
            created_at=index.created_at.isoformat(),
            updated_at=index.updated_at.isoformat(),
            document_count=index.document_count,
            chunk_count=index.chunk_count,
            error_message=index.error_message,
            embedding_model=index.embedding_config["model"],
            vector_db=index.embedding_config["vector_db"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# Add progress tracking endpoints
@router.get(
    "/collections/{collection_id}/progress/",
    response_model=ProcessingProgressSchema,
)
async def get_collection_progress(collection_id: str):
    """Get document collection processing progress."""
    if collection_id not in collection_progress:
        raise HTTPException(status_code=404, detail="No progress information found") from None
    return collection_progress[collection_id]


@router.get(
    "/indices/{index_id}/progress/",
    response_model=ProcessingProgressSchema,
    description="Get the processing progress of a vector index",
)
async def get_index_progress(index_id: str, db: Session = Depends(get_db)):
    """Get vector index processing progress."""
    logger.debug(f"Getting progress for index {index_id}")

    progress_record = (
        db.query(DocumentProcessingProgressModel)
        .filter(DocumentProcessingProgressModel.id == index_id)
        .first()
    )

    if not progress_record:
        raise HTTPException(status_code=404, detail="No progress information found") from None

    logger.debug(f"Progress data for index {index_id}: {progress_record.__dict__}")

    return ProcessingProgressSchema(
        id=str(progress_record.id),
        status=str(progress_record.status),
        progress=float(progress_record.progress),
        current_step=str(progress_record.current_step),
        total_files=int(progress_record.total_files),
        processed_files=int(progress_record.processed_files),
        total_chunks=int(progress_record.total_chunks),
        processed_chunks=int(progress_record.processed_chunks),
        error_message=(
            str(progress_record.error_message) if progress_record.error_message else None
        ),
        created_at=progress_record.created_at.isoformat(),
        updated_at=progress_record.updated_at.isoformat(),
    )


@router.post(
    "/collections/{collection_id}/documents/",
    response_model=DocumentCollectionResponseSchema,
)
async def add_documents_to_collection(
    collection_id: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """Add documents to an existing collection."""
    try:
        # Get the document collection
        collection = (
            db.query(DocumentCollectionModel)
            .filter(DocumentCollectionModel.id == collection_id)
            .first()
        )
        if not collection:
            raise HTTPException(status_code=404, detail="Document collection not found") from None

        # Read files and prepare file info
        file_infos: List[Dict[str, Any]] = []
        collection_dir = Path(f"data/knowledge_bases/{collection.id}")
        collection_dir.mkdir(parents=True, exist_ok=True)

        for file in files:
            if file.filename:
                file_path = collection_dir / file.filename
                content = await file.read()
                with open(file_path, "wb") as f:
                    f.write(content)
                file_infos.append(
                    {
                        "path": str(file_path),
                        "mime_type": file.content_type,
                        "name": file.filename,
                    }
                )

        # Update collection status
        collection.status = "processing"
        collection.document_count += len(files)
        db.commit()
        db.refresh(collection)

        # Start background processing
        if file_infos:
            doc_store = DocumentStore(collection.id)

            # Create progress callback
            async def progress_callback(
                progress: float, step: str, processed: int, total: int
            ) -> None:
                await update_collection_progress(
                    collection.id,
                    progress=progress,
                    current_step=step,
                    processed_files=processed if step == "parsing" else None,
                    processed_chunks=processed if step == "chunking" else None,
                    total_chunks=total if step == "chunking" else None,
                    db=db,
                )

            background_tasks.add_task(
                doc_store.process_documents,
                file_infos,
                collection.text_processing_config,
                progress_callback,
            )

        return DocumentCollectionResponseSchema(
            id=collection.id,
            name=collection.name,
            description=collection.description,
            status=collection.status,
            created_at=collection.created_at.isoformat(),
            updated_at=collection.updated_at.isoformat(),
            document_count=collection.document_count,
            chunk_count=collection.chunk_count,
            error_message=collection.error_message,
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/collections/{collection_id}/documents/{document_id}/")
async def delete_document_from_collection(
    collection_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    """Delete a document from a collection."""
    try:
        # Get the document collection
        collection = (
            db.query(DocumentCollectionModel)
            .filter(DocumentCollectionModel.id == collection_id)
            .first()
        )
        if not collection:
            raise HTTPException(status_code=404, detail="Document collection not found") from None

        # Initialize document store
        doc_store = DocumentStore(collection.id)

        # Check if document exists
        doc = doc_store.get_document(document_id)
        if not doc:
            raise HTTPException(
                status_code=404, detail="Document not found in collection"
            ) from None

        # Delete document
        success = doc_store.delete_document(document_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete document") from None

        # Update collection stats
        collection.document_count -= 1
        if doc.chunks:
            collection.chunk_count -= len(doc.chunks)
        db.commit()

        return {"message": "Document deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get(
    "/collections/{collection_id}/documents/",
    response_model=List[DocumentWithChunksSchema],
)
async def get_collection_documents(
    collection_id: str,
) -> List[DocumentWithChunksSchema]:
    """Get all documents and their chunks for a collection."""
    try:
        doc_store = DocumentStore(collection_id)
        documents: List[DocumentWithChunksSchema] = []
        for doc_id in doc_store.list_documents():
            doc = doc_store.get_document(doc_id)
            if doc:
                documents.append(doc)
        return documents
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post(
    "/collections/preview_chunk/",
    description="Preview how a document would be chunked with given configuration",
)
async def preview_chunk(
    file: UploadFile = File(...),
    chunking_config: str = Form(...),
) -> Dict[str, Any]:
    """Preview how a file will be chunked and formatted with templates."""
    try:
        # Parse chunking config
        config = ChunkingConfigSchema(**json.loads(chunking_config))

        if not file.filename:
            raise HTTPException(status_code=400, detail="Filename is required") from None

        # Get preview using chunker module
        preview_chunks, total_chunks = await preview_document_chunk(
            file.file, file.filename, file.content_type or "text/plain", config
        )

        return {"chunks": preview_chunks, "total_chunks": total_chunks}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Error previewing chunk: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post(
    "/indices/{index_id}/retrieve/",
    response_model=RetrievalResponseSchema,
    description="Retrieve relevant chunks from a vector index based on a query",
)
async def retrieve_from_index(
    index_id: str,
    request: RetrievalRequestSchema,
    db: Session = Depends(get_db),
) -> RetrievalResponseSchema:
    """Retrieve relevant documents from a vector index."""
    try:
        # Get the vector index from the database
        index = db.query(VectorIndexModel).filter(VectorIndexModel.id == index_id).first()
        if not index:
            raise HTTPException(status_code=404, detail="Vector index not found") from None

        # Check if index is ready
        if index.status != "ready":
            raise HTTPException(
                status_code=400,
                detail=f"Vector index is not ready (current status: {index.status})",
            ) from None

        # Initialize vector index
        vector_index = VectorIndex(index.id)

        # Retrieve from vector index with default top_k if not specified
        results = await vector_index.retrieve(
            query=request.query,
            top_k=request.top_k if request.top_k is not None else 5,
            score_threshold=request.score_threshold,
            semantic_weight=request.semantic_weight,
            keyword_weight=request.keyword_weight,
        )

        # Format results
        formatted_results: List[RetrievalResultSchema] = []
        for result in results:
            chunk = result["chunk"]
            metadata = result["metadata"]
            formatted_results.append(
                RetrievalResultSchema(
                    text=chunk.text,
                    score=result["score"],
                    metadata=ChunkMetadataSchema(
                        document_id=metadata.get("document_id", ""),
                        chunk_id=metadata.get("chunk_id", ""),
                        document_title=metadata.get("document_title"),
                        page_number=metadata.get("page_number"),
                        chunk_number=metadata.get("chunk_number"),
                    ),
                )
            )

        return RetrievalResponseSchema(
            results=formatted_results, total_results=len(formatted_results)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving from vector index: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e

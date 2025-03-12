import json
from pathlib import Path
from typing import (
    Any,
    Callable,
    Coroutine,
    Dict,
    List,
    Optional,
    Sequence,
    Union,
    cast,
)

import numpy as np
from loguru import logger

from .datastore.factory import get_datastore
from .embedder import (
    EmbeddingModels,
    get_multiple_text_embeddings,
    get_single_text_embedding,
)
from .schemas.document_schemas import (
    DocumentChunkSchema,
    DocumentMetadataFilterSchema,
    DocumentSchema,
    DocumentWithChunksSchema,
    QueryWithEmbeddingSchema,
)


class ProcessingError(Exception):
    """Custom exception for vector processing errors"""

    pass


async def _call_progress(
    on_progress: Optional[Callable[[float, str, int, int], Coroutine[Any, Any, None]]],
    progress: float,
    stage: str,
    processed_chunks: int,
    total_chunks: int,
) -> None:
    """Helper function to safely call the progress callback"""
    if on_progress:
        await on_progress(progress, stage, processed_chunks, total_chunks)


class VectorIndex:
    """Manages vector index operations."""

    def __init__(self, index_id: str):
        """Initialize vector index manager."""
        self.index_id = index_id
        self.base_dir = Path(f"data/vector_indices/{index_id}")
        self.embeddings_dir = self.base_dir / "embeddings"
        self.config_path = self.base_dir / "config.json"

        # Create base directory
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.embeddings_dir.mkdir(exist_ok=True)

        # Load or create config
        self.config = self._load_config()

    def _load_config(self) -> Dict[str, Any]:
        """Load vector index configuration."""
        if self.config_path.exists():
            with open(self.config_path) as f:
                return json.load(f)
        return {}

    def _save_config(self) -> None:
        """Save vector index configuration."""
        with open(self.config_path, "w") as f:
            json.dump(self.config, f, indent=2)

    def update_config(self, config: Dict[str, Any]) -> None:
        """Update vector index configuration."""
        self.config.update(config)
        self._save_config()

    async def create_from_document_collection(
        self,
        docs_with_chunks: List[DocumentWithChunksSchema],
        config: Dict[str, Any],
        on_progress: Optional[Callable[[float, str, int, int], Coroutine[Any, Any, None]]] = None,
    ) -> str:
        """Create a vector index from a document collection.

        Args:
            docs_with_chunks: List of documents with their chunks
            config: Configuration for processing
            on_progress: Async callback for progress updates

        Returns:
            str: Vector index ID

        """
        try:
            # Update config
            self.update_config(config)

            # Get all chunks
            all_chunks: List[DocumentChunkSchema] = []
            for doc in docs_with_chunks:
                all_chunks.extend(doc.chunks)

            if not all_chunks:
                logger.warning("No chunks found to process")
                return self.index_id

            # Initialize progress
            await _call_progress(on_progress, 0.0, "embedding", 0, len(all_chunks))

            # Get chunk texts
            chunk_texts = [chunk.text for chunk in all_chunks]

            try:
                # Use OpenAI's text-embedding-3-small by default
                embedding_model = config.get(
                    "model",
                    EmbeddingModels.TEXT_EMBEDDING_3_SMALL.value,
                )
                model_info = EmbeddingModels.get_model_info(embedding_model)
                if not model_info:
                    raise ValueError(f"Unknown embedding model: {embedding_model}")

                logger.debug(
                    f"Using embedding model: {embedding_model} with {model_info.dimensions} dimensions"
                )

                # Report starting embeddings phase
                await _call_progress(
                    on_progress,
                    0.0,
                    "embedding",
                    0,  # processed_chunks
                    len(all_chunks),  # total_chunks
                )

                embeddings: Sequence[
                    Union[List[float], np.ndarray]
                ] = await get_multiple_text_embeddings(
                    docs=chunk_texts,
                    model=embedding_model,
                    dimensions=model_info.dimensions,
                    batch_size=config.get("embeddings_batch_size", 128),
                    api_key=config.get("openai_api_key"),
                )

                logger.debug(f"[DEBUG] Embeddings generated: {embeddings}.")
            except Exception as e:
                logger.error(f"Error generating embeddings: {str(e)}")
                raise ProcessingError(f"Failed to generate embeddings: {str(e)}")

            # Update chunks with embeddings
            processed_chunks = 0
            for i, chunk in enumerate(all_chunks):
                if embeddings[i] is None:
                    logger.error(f"No embedding generated for chunk {i}")
                    continue

                # Convert embedding to list of floats
                try:
                    embedding_list = (
                        embeddings[i].tolist()
                        if hasattr(embeddings[i], "tolist")
                        else embeddings[i]
                    )
                    embedding_list = [float(x) for x in embedding_list]
                    chunk.embedding = embedding_list

                    # Save embeddings
                    doc_id = chunk.metadata.document_id
                    if doc_id is not None:
                        emb_path = self.embeddings_dir / f"{doc_id}_{i}.json"
                        with open(emb_path, "w") as f:
                            json.dump(
                                {
                                    "chunk_id": chunk.id,
                                    "embedding": embedding_list,
                                },
                                f,
                            )
                    processed_chunks += 1
                except Exception as e:
                    logger.error(f"Error converting embedding: {str(e)}")
                    continue

                # Update progress for embedding phase (0-70%)
                await _call_progress(
                    on_progress,
                    (i + 1) / len(all_chunks) * 0.7,
                    "embedding",
                    processed_chunks,  # processed_chunks
                    len(all_chunks),  # total_chunks
                )

            # Report starting vector store upload
            await _call_progress(
                on_progress,
                0.7,
                "uploading",
                processed_chunks,  # processed_chunks
                len(all_chunks),  # total_chunks
            )

            # Initialize datastore
            datastore = await get_datastore(config["vector_db"], embedding_model=embedding_model)
            logger.debug("Datastore initialized, starting to upsert chunks.")

            # Insert chunks into datastore
            await datastore.upsert(
                cast(List[DocumentSchema], docs_with_chunks),
                chunk_token_size=config.get("chunk_token_size", 200),
            )
            logger.debug("All chunks successfully upserted into datastore.")

            # Update progress for completion
            await _call_progress(
                on_progress,
                1.0,
                "completed",
                processed_chunks,  # processed_chunks
                len(all_chunks),  # total_chunks
            )

            return self.index_id

        except Exception as e:
            logger.error(f"Error occurred during processing: {e}")
            raise ProcessingError(f"Error processing documents: {str(e)}")

    def get_config(self) -> Dict[str, Any]:
        """Get the current vector index configuration."""
        return self.config.copy()

    def get_status(self) -> Dict[str, Any]:
        """Get the current status of the vector index."""
        return {
            "id": self.index_id,
            "has_embeddings": self.embeddings_dir.exists() and any(self.embeddings_dir.iterdir()),
            "config": self.get_config(),
        }

    async def delete(self) -> bool:
        """Delete the vector index and its data."""
        try:
            # Initialize datastore
            datastore = await get_datastore(
                self.config["vector_db"],
                embedding_model=self.config.get("model"),
            )

            # Delete vectors from vector database
            await datastore.delete(
                filter=DocumentMetadataFilterSchema(
                    document_id=self.index_id,
                ),
                delete_all=False,
            )

            # Delete files from filesystem
            if self.base_dir.exists():
                import shutil

                shutil.rmtree(self.base_dir)

            return True
        except Exception as e:
            logger.error(f"Error deleting vector index: {e}")
            return False

    async def retrieve(
        self,
        query: str,
        top_k: int = 5,
        score_threshold: Optional[float] = None,
        semantic_weight: Optional[float] = 1.0,
        keyword_weight: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant documents from the vector index.

        Args:
            query: The search query
            top_k: Number of results to return
            score_threshold: Minimum similarity score threshold
            semantic_weight: Weight for semantic search (0 to 1)
            keyword_weight: Weight for keyword search (0 to 1)

        Returns:
            List of documents with their similarity scores

        """
        try:
            # Get embedding model from config
            embedding_model = self.config.get("embedding_config", {}).get("model")
            if not embedding_model:
                raise ValueError("No embedding model specified in vector index configuration")

            # Initialize datastore
            datastore = await get_datastore(
                self.config["vector_db"], embedding_model=embedding_model
            )

            # Get embedding for query
            query_embedding = await get_single_text_embedding(
                text=query,
                model=embedding_model,
                api_key=self.config.get("openai_api_key"),
            )

            # Create query with embedding
            query_with_embedding = QueryWithEmbeddingSchema(
                query=query,
                embedding=query_embedding,
                top_k=top_k,
            )

            # Query the datastore
            results = await datastore.query([query_with_embedding])

            if not results or not results[0].results:
                return []

            # Format results
            formatted_results = []
            for result in results[0].results:
                formatted_results.append(
                    {
                        "chunk": result,
                        "score": result.score,
                        "metadata": result.metadata.model_dump() if result.metadata else {},
                    }
                )

            return formatted_results

        except Exception as e:
            logger.error(f"Error retrieving from vector index: {e}")
            raise

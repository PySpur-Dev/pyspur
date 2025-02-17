import asyncio
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

from ..chunker import create_document_chunks
from ..schemas.document_schemas import (
    ChunkingConfigSchema,
    DocumentChunkSchema,
    DocumentMetadataFilterSchema,
    DocumentSchema,
    QueryResultSchema,
    QueryWithEmbeddingSchema,
)


class DataStore(ABC):
    def __init__(self, embedding_dimension: Optional[int] = None):
        self.embedding_dimension = embedding_dimension

    async def upsert(
        self,
        documents: List[DocumentSchema],
        chunk_token_size: Optional[int] = None,
    ) -> List[str]:
        """
        Takes in a list of documents and inserts them into the database.
        First deletes all the existing vectors with the document id (if necessary, depends on the vector db), then inserts the new ones.
        Return a list of document ids.
        """
        # Delete any existing vectors for documents with the input document ids
        await asyncio.gather(
            *[
                self.delete(
                    filter=DocumentMetadataFilterSchema(
                        document_id=document.id,
                    ),
                    delete_all=False,
                )
                for document in documents
                if document.id
            ]
        )

        chunks = {}
        for doc in documents:
            # If the document already has chunks with embeddings, use those
            if hasattr(doc, "chunks") and doc.chunks:
                chunks[doc.id] = doc.chunks
            else:
                # Only create new chunks if the document doesn't have them
                config = (
                    ChunkingConfigSchema(chunk_token_size=chunk_token_size)
                    if chunk_token_size
                    else ChunkingConfigSchema()
                )
                doc_chunks, doc_id = create_document_chunks(doc, config)
                chunks[doc_id] = doc_chunks

        return await self._upsert(chunks)

    @abstractmethod
    async def _upsert(self, chunks: Dict[str, List[DocumentChunkSchema]]) -> List[str]:
        """
        Takes in a list of document chunks and inserts them into the database.
        Return a list of document ids.
        """

        raise NotImplementedError

    async def query(self, queries: List[QueryWithEmbeddingSchema]) -> List[QueryResultSchema]:
        """
        Takes in a list of queries with embeddings and returns a list of query results with matching document chunks and scores.
        """
        return await self._query(queries)

    @abstractmethod
    async def _query(self, queries: List[QueryWithEmbeddingSchema]) -> List[QueryResultSchema]:
        """
        Takes in a list of queries with embeddings and filters and returns a list of query results with matching document chunks and scores.
        """
        raise NotImplementedError

    @abstractmethod
    async def delete(
        self,
        ids: Optional[List[str]] = None,
        filter: Optional[DocumentMetadataFilterSchema] = None,
        delete_all: Optional[bool] = None,
    ) -> bool:
        """
        Removes vectors by ids, filter, or everything in the datastore.
        Multiple parameters can be used at once.
        Returns whether the operation was successful.
        """
        raise NotImplementedError

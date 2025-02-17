import asyncio
import os
from typing import Any, Dict, List, Optional

from loguru import logger
from pinecone import Pinecone, ServerlessSpec
from tenacity import retry, stop_after_attempt, wait_random_exponential

from ...schemas.document_schemas import (
    DocumentChunkMetadataSchema,
    DocumentChunkSchema,
    DocumentChunkWithScoreSchema,
    DocumentMetadataFilterSchema,
    QueryResultSchema,
    QueryWithEmbeddingSchema,
    Source,
)
from ..datastore import DataStore
from ..services.date import to_unix_timestamp

# Read environment variables for Pinecone configuration
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY")
PINECONE_INDEX = os.environ.get("PINECONE_INDEX")
PINECONE_CLOUD = os.environ.get("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.environ.get("PINECONE_REGION", "us-west-2")

# Validate required environment variables
missing_vars = []
if not PINECONE_API_KEY:
    missing_vars.append("PINECONE_API_KEY")
if not PINECONE_INDEX:
    missing_vars.append("PINECONE_INDEX")

if missing_vars:
    raise ValueError(
        f"Missing required environment variables for Pinecone: {', '.join(missing_vars)}. "
        "Please set these variables in your environment or .env file."
    )

# Initialize Pinecone client
pc = Pinecone(api_key=PINECONE_API_KEY)

# Set the batch size for upserting vectors to Pinecone
UPSERT_BATCH_SIZE = 100


class PineconeDataStore(DataStore):
    def __init__(self, embedding_dimension: Optional[int] = None):
        super().__init__(embedding_dimension=embedding_dimension)
        # Check if the index name is specified and exists in Pinecone
        if PINECONE_INDEX and PINECONE_INDEX not in pc.list_indexes().names():
            # Get all fields in the metadata object in a list
            fields_to_index = list(DocumentChunkMetadataSchema.model_fields.keys())

            # Create a new index with the specified name, dimension, and metadata configuration
            try:
                logger.info(
                    f"Creating index {PINECONE_INDEX} with metadata config {fields_to_index}"
                )
                pc.create_index(
                    name=PINECONE_INDEX,
                    dimension=self.embedding_dimension or 1536,  # Default to 1536 if not specified
                    spec=ServerlessSpec(cloud=PINECONE_CLOUD, region=PINECONE_REGION),
                    metadata_config={"indexed": fields_to_index},
                )
                self.index = pc.Index(name=PINECONE_INDEX)
                logger.info(f"Index {PINECONE_INDEX} created successfully")
            except Exception as e:
                logger.error(f"Error creating index {PINECONE_INDEX}: {e}")
                raise e
        elif PINECONE_INDEX and PINECONE_INDEX in pc.list_indexes().names():
            # Connect to an existing index with the specified name
            try:
                logger.info(f"Connecting to existing index {PINECONE_INDEX}")
                self.index = pc.Index(name=PINECONE_INDEX)
                logger.info(f"Connected to index {PINECONE_INDEX} successfully")
            except Exception as e:
                logger.error(f"Error connecting to index {PINECONE_INDEX}: {e}")
                raise e

    @retry(wait=wait_random_exponential(min=1, max=20), stop=stop_after_attempt(3))
    async def _upsert(self, chunks: Dict[str, List[DocumentChunkSchema]]) -> List[str]:
        """
        Takes in a dict from document id to list of document chunks and inserts them into the index.
        Return a list of document ids.
        """
        if not isinstance(chunks, dict):
            raise ValueError("Expected chunks to be a dictionary")

        # Initialize a list of ids to return
        doc_ids: List[str] = []
        # Initialize a list of vectors to upsert
        vectors = []
        # Loop through the dict items
        for doc_id, chunk_list in chunks.items():
            # Append the id to the ids list
            doc_ids.append(doc_id)
            logger.info(f"Upserting document_id: {doc_id}")
            for chunk in chunk_list:
                # Create a vector tuple of (id, embedding, metadata)
                # Convert the metadata object to a dict with unix timestamps for dates
                pinecone_metadata = self._get_pinecone_metadata(chunk.metadata)
                # Add the text and document id to the metadata dict
                pinecone_metadata["text"] = chunk.text
                pinecone_metadata["document_id"] = doc_id
                # Convert embedding values to float
                float_embedding = [float(val) for val in chunk.embedding]
                # Log embedding details
                logger.debug(
                    f"Chunk {chunk.id} embedding stats - length: {len(float_embedding)}, non-zero values: {sum(1 for x in float_embedding if x != 0)}, sample: {float_embedding[:5]}"
                )

                vector = (chunk.id, float_embedding, pinecone_metadata)
                vectors.append(vector)

        # Split the vectors list into batches of the specified size
        batches = [
            vectors[i : i + UPSERT_BATCH_SIZE] for i in range(0, len(vectors), UPSERT_BATCH_SIZE)
        ]
        # Upsert each batch to Pinecone
        for batch in batches:
            try:
                logger.info(f"Upserting batch of size {len(batch)}")
                self.index.upsert(vectors=batch)
                logger.info(f"Upserted batch successfully")
            except Exception as e:
                logger.error(f"Error upserting batch: {e}")
                raise e

        return doc_ids

    @retry(wait=wait_random_exponential(min=1, max=20), stop=stop_after_attempt(3))
    async def _query(
        self,
        queries: List[QueryWithEmbeddingSchema],
    ) -> List[QueryResultSchema]:
        """
        Takes in a list of queries with embeddings and filters and returns a list of query results with matching document chunks and scores.
        """

        # Define a helper coroutine that performs a single query and returns a QueryResult
        async def _single_query(
            query: QueryWithEmbeddingSchema,
        ) -> QueryResultSchema:
            logger.debug(f"Query: {query.query}")

            # Convert the metadata filter object to a dict with pinecone filter expressions
            pinecone_filter = self._get_pinecone_filter(query.filter)

            try:
                # Query the index with the query embedding, filter, and top_k
                query_response = self.index.query(
                    # namespace=namespace,
                    top_k=query.top_k or 10,  # Default to 10 if top_k is None
                    vector=query.embedding,
                    filter=pinecone_filter,
                    include_metadata=True,
                )
            except Exception as e:
                logger.error(f"Error querying index: {e}")
                raise e

            query_results: List[DocumentChunkWithScoreSchema] = []
            for result in query_response.matches:
                score = result.score
                metadata = result.metadata
                # Remove document id and text from metadata and store it in a new variable
                metadata_without_text = (
                    {key: value for key, value in metadata.items() if key != "text"}
                    if metadata
                    else None
                )

                # If the source is not a valid Source in the Source enum, set it to None
                if (
                    metadata_without_text
                    and "source" in metadata_without_text
                    and metadata_without_text["source"] not in Source.__members__
                ):
                    metadata_without_text["source"] = None

                # Convert created_at from timestamp back to string if it exists
                if metadata_without_text and "created_at" in metadata_without_text:
                    from datetime import datetime

                    timestamp = float(metadata_without_text["created_at"])
                    metadata_without_text["created_at"] = datetime.fromtimestamp(
                        timestamp
                    ).isoformat()

                # Create a document chunk with score object with the result data
                result = DocumentChunkWithScoreSchema(
                    id=result.id,
                    score=score,
                    text=(str(metadata["text"]) if metadata and "text" in metadata else ""),
                    metadata=DocumentChunkMetadataSchema(**metadata_without_text)
                    if metadata_without_text
                    else DocumentChunkMetadataSchema(),
                )
                query_results.append(result)
            return QueryResultSchema(query=query.query, results=query_results)

        # Use asyncio.gather to run multiple _single_query coroutines concurrently and collect their results
        results: List[QueryResultSchema] = await asyncio.gather(
            *[_single_query(query) for query in queries]
        )

        return results

    @retry(wait=wait_random_exponential(min=1, max=20), stop=stop_after_attempt(3))
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
        if delete_all:
            try:
                logger.info(f"Deleting all vectors from index")
                self.index.delete(delete_all=True)
                logger.info(f"Deleted all vectors successfully")
                return True
            except Exception as e:
                logger.error(f"Error deleting all vectors: {e}")
                return False

        if ids and len(ids) > 0:
            try:
                # First, query to get the chunk IDs associated with these document IDs
                dummy_vector: List[float] = [0.0] * (
                    self.embedding_dimension or 1536
                )  # Default to 1536 if not specified
                query_response = self.index.query(
                    vector=dummy_vector,  # Dummy vector for metadata-only query
                    filter={"document_id": {"$in": ids}},
                    top_k=10000,  # Get as many matches as possible
                    include_metadata=True,
                )

                # Extract the chunk IDs from the response
                chunk_ids: List[str] = []
                if hasattr(query_response, "matches"):
                    chunk_ids = [str(match.id) for match in query_response.matches]

                if chunk_ids:
                    logger.info(f"Deleting vectors with chunk ids {chunk_ids}")
                    self.index.delete(ids=chunk_ids)
                    logger.info(f"Deleted vectors with ids successfully")

                return True
            except Exception as e:
                logger.error(f"Error deleting vectors with ids {ids}: {e}")
                return False

        if filter:
            try:
                pinecone_filter = self._get_pinecone_filter(filter)
                # Query to get the IDs of vectors that match the filter
                dummy_vector: List[float] = [0.0] * (
                    self.embedding_dimension or 1536
                )  # Default to 1536 if not specified
                query_response = self.index.query(
                    vector=dummy_vector,  # Dummy vector for metadata-only query
                    filter=pinecone_filter,
                    top_k=10000,  # Get as many matches as possible
                    include_metadata=True,
                )

                # Extract the IDs from the response
                chunk_ids: List[str] = []
                if hasattr(query_response, "matches"):
                    chunk_ids = [str(match.id) for match in query_response.matches]

                if chunk_ids:
                    logger.info(f"Deleting vectors with chunk ids {chunk_ids}")
                    self.index.delete(ids=chunk_ids)
                    logger.info(f"Deleted vectors with filter successfully")

                return True
            except Exception as e:
                logger.error(f"Error deleting vectors with filter: {e}")
                return False

        return False

    def _get_pinecone_filter(
        self, filter: Optional[DocumentMetadataFilterSchema] = None
    ) -> Dict[str, Any]:
        if filter is None:
            return {}

        pinecone_filter = {}

        # For each field in the MetadataFilter, check if it has a value and add the corresponding pinecone filter expression
        # For start_date and end_date, uses the $gte and $lte operators respectively
        # For other fields, uses the $eq operator
        for field, value in filter.model_dump().items():
            if value is not None:
                if field == "start_date":
                    pinecone_filter["created_at"] = pinecone_filter.get("created_at", {})
                    pinecone_filter["created_at"]["$gte"] = to_unix_timestamp(value)
                elif field == "end_date":
                    pinecone_filter["created_at"] = pinecone_filter.get("created_at", {})
                    pinecone_filter["created_at"]["$lte"] = to_unix_timestamp(value)
                else:
                    pinecone_filter[field] = value

        return pinecone_filter

    def _get_pinecone_metadata(
        self, metadata: Optional[DocumentChunkMetadataSchema] = None
    ) -> Dict[str, Any]:
        if metadata is None:
            return {}

        pinecone_metadata = {}

        # Convert the metadata to a dict
        metadata_dict = metadata.model_dump()

        # For each field in the Metadata, check if it has a value and add it to the pinecone metadata dict
        # Flatten nested structures and ensure values are primitive types
        for field, value in metadata_dict.items():
            if value is not None:
                if field in ["created_at"]:
                    pinecone_metadata[field] = to_unix_timestamp(value)
                elif isinstance(value, (str, int, float, bool)):
                    pinecone_metadata[field] = value
                elif isinstance(value, list) and all(isinstance(x, str) for x in value):
                    pinecone_metadata[field] = value
                elif isinstance(value, dict):
                    # Flatten nested dict by prefixing keys with the field name
                    for k, v in value.items():
                        if isinstance(v, (str, int, float, bool)):
                            pinecone_metadata[f"{field}_{k}"] = v
                else:
                    # Convert other types to strings if possible
                    try:
                        pinecone_metadata[field] = str(value)
                    except:
                        # Skip values that can't be converted to string
                        continue

        return pinecone_metadata

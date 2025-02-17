import json
from typing import Dict, List

from jinja2 import Template
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.dc_and_vi_model import VectorIndexModel
from ...rag.embedder import EmbeddingModels
from ...rag.vector_index import VectorIndex
from ...schemas.rag_schemas import (
    ChunkMetadataSchema,
    RetrievalResultSchema,
)
from ..base import (
    BaseNode,
    BaseNodeConfig,
    BaseNodeInput,
    BaseNodeOutput,
)

# Todo: Use Fixed Node Output; where the outputs will always be chunks


class RetrieverNodeInput(BaseNodeInput):
    """Input for the retriever node"""

    class Config:
        extra = "allow"


class RetrieverNodeOutput(BaseNodeOutput):
    """Output from the retriever node"""

    results: List[RetrievalResultSchema] = Field(..., description="List of retrieved results")
    total_results: int = Field(..., description="Total number of results found")


class RetrieverNodeConfig(BaseNodeConfig):
    """Configuration for the retriever node"""

    output_schema: Dict[str, str] = Field(
        default={
            "results": "list[RetrievalResultSchema]",
            "total_results": "integer",
        },
        description="The schema for the output of the node",
    )
    output_json_schema: str = Field(
        default=json.dumps(RetrieverNodeOutput.model_json_schema(), indent=2),
        description="The JSON schema for the output of the node",
    )
    vector_index_id: str = Field(..., description="ID of the vector index to query", min_length=1)
    top_k: int = Field(5, description="Number of results to return", ge=1, le=10)
    query_template: str = Field(
        "{{input_1}}",
        description="Template for the query string. Use {{variable}} syntax to reference input variables.",
    )
    # score_threshold: Optional[float] = Field(None, description="Minimum similarity score threshold")
    # semantic_weight: float = Field(1.0, description="Weight for semantic search (0 to 1)")
    # keyword_weight: Optional[float] = Field(None, description="Weight for keyword search (0 to 1)")


class RetrieverNode(BaseNode):
    """Node for retrieving relevant documents from a vector index"""

    name = "retriever_node"
    display_name = "Retriever"
    config_model = RetrieverNodeConfig
    input_model = RetrieverNodeInput
    output_model = RetrieverNodeOutput

    async def validate_index(self, db: Session) -> None:
        """Validate that the vector index exists and is ready"""
        index = (
            db.query(VectorIndexModel)
            .filter(VectorIndexModel.id == self.config.vector_index_id)
            .first()
        )
        if not index:
            raise ValueError(f"Vector index {self.config.vector_index_id} not found")
        if index.status != "ready":
            raise ValueError(
                f"Vector index {self.config.vector_index_id} is not ready (status: {index.status})"
            )

    async def run(self, input: BaseModel) -> BaseModel:
        # Get database session
        db = next(get_db())

        try:
            # Validate index exists and is ready
            await self.validate_index(db)

            # Get vector index configuration from database
            vector_index_model = (
                db.query(VectorIndexModel)
                .filter(VectorIndexModel.id == self.config.vector_index_id)
                .first()
            )
            if not vector_index_model:
                raise ValueError(f"Vector index {self.config.vector_index_id} not found")

            logger.info(
                f"[DEBUG] Vector index configuration: {vector_index_model.embedding_config}"
            )

            # Get embedding model from vector index configuration
            embedding_model = vector_index_model.embedding_config.get("model")
            if not embedding_model:
                raise ValueError("No embedding model specified in vector index configuration")

            logger.info(f"[DEBUG] Using embedding model: {embedding_model}")

            # Initialize vector index and set its configuration
            vector_index = VectorIndex(self.config.vector_index_id)
            embedding_model_info = EmbeddingModels.get_model_info(embedding_model)
            assert embedding_model_info is not None
            vector_index.update_config(
                {
                    "embedding_config": {
                        "model": embedding_model,
                        "dimensions": embedding_model_info.dimensions,
                    },
                    "vector_db": vector_index_model.embedding_config.get("vector_db", "pinecone"),
                }
            )

            # Render query template with input variables
            raw_input_dict = input.model_dump()
            query = Template(self.config.query_template).render(**raw_input_dict)

            # Create retrieval request
            results = await vector_index.retrieve(
                query=query,
                top_k=self.config.top_k,
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

            return RetrieverNodeOutput(
                results=formatted_results, total_results=len(formatted_results)
            )
        except Exception as e:
            raise ValueError(f"Error retrieving from vector index: {str(e)}")
        finally:
            db.close()


if __name__ == "__main__":
    import asyncio

    async def test_retriever_node():
        # Create a test instance
        retriever = RetrieverNode(
            name="test_retriever",
            config=RetrieverNodeConfig(
                vector_index_id="VI1",  # Using proper vector index ID format
                top_k=3,
                query_template="{{input_1}}",
            ),
        )

        # Create test input
        test_input = RetrieverNodeInput(input_1="What is machine learning?")  # type: ignore

        print("[DEBUG] Testing retriever_node...")
        try:
            output = await retriever(test_input)
            print("[DEBUG] Test Output:", output)
        except Exception as e:
            print("[ERROR] Test failed:", str(e))

    asyncio.run(test_retriever_node())

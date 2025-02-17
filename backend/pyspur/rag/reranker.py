import logging
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from litellm import arerank
from pydantic import BaseModel, Field
from tenacity import stop_after_attempt, wait_random_exponential

from ..nodes.llm._utils import async_retry


class RerankerProvider(str, Enum):
    COHERE = "Cohere"


class RerankerModelConfig(BaseModel):
    id: str
    provider: RerankerProvider
    name: str
    max_input_length: int = Field(default=8191)


class RerankerModels(str, Enum):
    # Cohere Models
    COHERE_RERANK_ENGLISH = "cohere/rerank-english-v3.0"
    COHERE_RERANK_MULTILINGUAL = "cohere/rerank-multilingual-v3.0"

    @classmethod
    def get_model_info(cls, model_id: str) -> RerankerModelConfig:
        model_registry = {
            # Cohere Models
            cls.COHERE_RERANK_ENGLISH.value: RerankerModelConfig(
                id=cls.COHERE_RERANK_ENGLISH.value,
                provider=RerankerProvider.COHERE,
                name="Cohere Rerank English V3",
                max_input_length=8191,
            ),
            cls.COHERE_RERANK_MULTILINGUAL.value: RerankerModelConfig(
                id=cls.COHERE_RERANK_MULTILINGUAL.value,
                provider=RerankerProvider.COHERE,
                name="Cohere Rerank Multilingual V3",
                max_input_length=8191,
            ),
        }
        return model_registry.get(model_id)


@async_retry(
    wait=wait_random_exponential(min=30, max=120),
    stop=stop_after_attempt(3),
)
async def rerank_documents_by_query(
    query: str,
    documents: List[Any],
    model: str,
    top_n: int = 3,
    text_extractor: Optional[Callable[[Any], str]] = None,
    api_key: Optional[str] = None,
    batch_size: int = 100,
) -> List[Dict[str, Any]]:
    """Rerank documents based on their relevance to the query."""
    try:
        model_info = RerankerModels.get_model_info(model)
        if not model_info:
            raise ValueError(f"Unknown model: {model}")

        # Extract text from documents if text_extractor is provided
        if text_extractor:
            doc_texts = [text_extractor(doc) for doc in documents]
        else:
            if all(isinstance(doc, str) for doc in documents):
                doc_texts = documents
            else:
                logging.error(
                    "Documents must be strings or you must provide a text_extractor function."
                )
                return []

        # Process in batches if needed
        all_results = []
        for i in range(0, len(doc_texts), batch_size):
            batch = doc_texts[i : i + batch_size]

            # Prepare kwargs for litellm
            kwargs = {
                "model": model,
                "query": query,
                "documents": batch,
                "top_n": min(top_n, len(batch)),
            }

            if api_key:
                kwargs["api_key"] = api_key

            response = await arerank(**kwargs)

            # Process results
            batch_results = []
            for result in response.data:
                batch_results.append(
                    {
                        "document": documents[i + result.document_index],
                        "relevance_score": result.relevance_score,
                        "index": i + result.document_index,
                    }
                )
            all_results.extend(batch_results)

        # Sort all results by relevance score and take top_n
        all_results.sort(key=lambda x: x["relevance_score"], reverse=True)
        return all_results[:top_n]

    except Exception as e:
        logging.error(f"Error reranking documents: {str(e)}")
        raise


async def get_top_n_relevant_documents(
    query: str,
    documents: List[Any],
    model: str,
    top_n: int = 3,
    text_extractor: Optional[Callable[[Any], str]] = None,
    id_extractor: Optional[Callable[[Any], Any]] = None,
    api_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Find the most relevant documents for a query using reranking."""
    results = await rerank_documents_by_query(
        query=query,
        documents=documents,
        model=model,
        top_n=top_n,
        text_extractor=text_extractor,
        api_key=api_key,
    )

    # Add document IDs if id_extractor is provided
    if id_extractor:
        for result in results:
            result["id"] = id_extractor(result["document"])

    return results

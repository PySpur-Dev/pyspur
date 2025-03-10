import logging
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, TypeAlias, Union

import numpy as np
import numpy.typing as npt
from litellm import aembedding
from litellm.types.utils import EmbeddingResponse
from pydantic import BaseModel, Field
from tenacity import stop_after_attempt, wait_random_exponential

from ..nodes.llm._utils import async_retry

EmbeddingArray: TypeAlias = npt.NDArray[np.float32]
EmbeddingData = Dict[str, List[float]]


class EmbeddingProvider(str, Enum):
    OPENAI = "OpenAI"
    AZURE_OPENAI = "AzureOpenAI"
    COHERE = "Cohere"
    VOYAGE = "Voyage"
    MISTRAL = "Mistral"
    GEMINI = "Gemini"


class CohereEncodingFormat(str, Enum):
    FLOAT = "float"
    INT8 = "int8"
    UINT8 = "uint8"
    BINARY = "binary"
    UBINARY = "ubinary"


class EmbeddingModelConfig(BaseModel):
    id: str
    provider: EmbeddingProvider
    name: str
    dimensions: int = Field(default=1536)
    max_input_length: int = Field(default=8191)
    supported_encoding_formats: Optional[List[CohereEncodingFormat]] = None
    required_env_vars: List[str] = Field(default_factory=list)


class EmbeddingModels(str, Enum):
    # OpenAI Models
    TEXT_EMBEDDING_3_SMALL = "openai/text-embedding-3-small"
    TEXT_EMBEDDING_3_LARGE = "openai/text-embedding-3-large"

    # Azure OpenAI Models
    AZURE_TEXT_EMBEDDING_3_SMALL = "azure/text-embedding-3-small"
    AZURE_TEXT_EMBEDDING_3_LARGE = "azure/text-embedding-3-large"

    # Cohere Models
    COHERE_EMBED_ENGLISH = "cohere/embed-english-v3.0"
    COHERE_EMBED_ENGLISH_LIGHT = "cohere/embed-english-light-v3.0"
    COHERE_EMBED_MULTILINGUAL = "cohere/embed-multilingual-v3.0"
    COHERE_EMBED_MULTILINGUAL_LIGHT = "cohere/embed-multilingual-light-v3.0"

    # Voyage Models
    VOYAGE_3_LARGE = "voyage/voyage-3-large"
    VOYAGE_3 = "voyage/voyage-3"
    VOYAGE_3_LITE = "voyage/voyage-3-lite"
    VOYAGE_CODE_3 = "voyage/voyage-code-3"
    VOYAGE_FINANCE_2 = "voyage/voyage-finance-2"
    VOYAGE_LAW_2 = "voyage/voyage-law-2"

    # Mistral Models
    MISTRAL_EMBED = "mistral/mistral-embed"

    # Gemini Models
    GEMINI_TEXT_EMBEDDING = "gemini/text-embedding-004"

    @classmethod
    def get_model_info(cls, model_id: str) -> Optional[EmbeddingModelConfig]:
        model_registry = {
            # OpenAI Models
            cls.TEXT_EMBEDDING_3_SMALL.value: EmbeddingModelConfig(
                id=cls.TEXT_EMBEDDING_3_SMALL.value,
                provider=EmbeddingProvider.OPENAI,
                name="Text Embedding 3 Small",
                dimensions=1536,
                max_input_length=8191,
            ),
            cls.TEXT_EMBEDDING_3_LARGE.value: EmbeddingModelConfig(
                id=cls.TEXT_EMBEDDING_3_LARGE.value,
                provider=EmbeddingProvider.OPENAI,
                name="Text Embedding 3 Large",
                dimensions=3072,
                max_input_length=8191,
            ),
            # Azure OpenAI Models
            cls.AZURE_TEXT_EMBEDDING_3_SMALL.value: EmbeddingModelConfig(
                id=cls.AZURE_TEXT_EMBEDDING_3_SMALL.value,
                provider=EmbeddingProvider.AZURE_OPENAI,
                name="Azure Text Embedding 3 Small",
                dimensions=1536,
                max_input_length=8191,
            ),
            cls.AZURE_TEXT_EMBEDDING_3_LARGE.value: EmbeddingModelConfig(
                id=cls.AZURE_TEXT_EMBEDDING_3_LARGE.value,
                provider=EmbeddingProvider.AZURE_OPENAI,
                name="Azure Text Embedding 3 Large",
                dimensions=3072,
                max_input_length=8191,
            ),
            # Cohere Models
            cls.COHERE_EMBED_ENGLISH.value: EmbeddingModelConfig(
                id=cls.COHERE_EMBED_ENGLISH.value,
                provider=EmbeddingProvider.COHERE,
                name="Cohere Embed English V3",
                dimensions=1024,
                max_input_length=8191,
                supported_encoding_formats=[
                    CohereEncodingFormat.FLOAT,
                    CohereEncodingFormat.INT8,
                    CohereEncodingFormat.UINT8,
                    CohereEncodingFormat.BINARY,
                    CohereEncodingFormat.UBINARY,
                ],
            ),
            cls.COHERE_EMBED_ENGLISH_LIGHT.value: EmbeddingModelConfig(
                id=cls.COHERE_EMBED_ENGLISH_LIGHT.value,
                provider=EmbeddingProvider.COHERE,
                name="Cohere Embed English Light V3",
                dimensions=384,
                max_input_length=8191,
                supported_encoding_formats=[
                    CohereEncodingFormat.FLOAT,
                    CohereEncodingFormat.INT8,
                    CohereEncodingFormat.UINT8,
                    CohereEncodingFormat.BINARY,
                    CohereEncodingFormat.UBINARY,
                ],
            ),
            cls.COHERE_EMBED_MULTILINGUAL.value: EmbeddingModelConfig(
                id=cls.COHERE_EMBED_MULTILINGUAL.value,
                provider=EmbeddingProvider.COHERE,
                name="Cohere Embed Multilingual V3",
                dimensions=1024,
                max_input_length=8191,
                supported_encoding_formats=[
                    CohereEncodingFormat.FLOAT,
                    CohereEncodingFormat.INT8,
                    CohereEncodingFormat.UINT8,
                    CohereEncodingFormat.BINARY,
                    CohereEncodingFormat.UBINARY,
                ],
            ),
            cls.COHERE_EMBED_MULTILINGUAL_LIGHT.value: EmbeddingModelConfig(
                id=cls.COHERE_EMBED_MULTILINGUAL_LIGHT.value,
                provider=EmbeddingProvider.COHERE,
                name="Cohere Embed Multilingual Light V3",
                dimensions=384,
                max_input_length=8191,
                supported_encoding_formats=[
                    CohereEncodingFormat.FLOAT,
                    CohereEncodingFormat.INT8,
                    CohereEncodingFormat.UINT8,
                    CohereEncodingFormat.BINARY,
                    CohereEncodingFormat.UBINARY,
                ],
            ),
            # Voyage Models
            cls.VOYAGE_3_LARGE.value: EmbeddingModelConfig(
                id=cls.VOYAGE_3_LARGE.value,
                provider=EmbeddingProvider.VOYAGE,
                name="Voyage 3 Large",
                dimensions=1024,
                max_input_length=32000,
            ),
            cls.VOYAGE_3.value: EmbeddingModelConfig(
                id=cls.VOYAGE_3.value,
                provider=EmbeddingProvider.VOYAGE,
                name="Voyage 3",
                dimensions=1024,
                max_input_length=32000,
            ),
            cls.VOYAGE_3_LITE.value: EmbeddingModelConfig(
                id=cls.VOYAGE_3_LITE.value,
                provider=EmbeddingProvider.VOYAGE,
                name="Voyage 3 Lite",
                dimensions=512,
                max_input_length=32000,
            ),
            cls.VOYAGE_CODE_3.value: EmbeddingModelConfig(
                id=cls.VOYAGE_CODE_3.value,
                provider=EmbeddingProvider.VOYAGE,
                name="Voyage Code 3",
                dimensions=1024,
                max_input_length=32000,
            ),
            cls.VOYAGE_FINANCE_2.value: EmbeddingModelConfig(
                id=cls.VOYAGE_FINANCE_2.value,
                provider=EmbeddingProvider.VOYAGE,
                name="Voyage Finance 2",
                dimensions=1024,
                max_input_length=32000,
            ),
            cls.VOYAGE_LAW_2.value: EmbeddingModelConfig(
                id=cls.VOYAGE_LAW_2.value,
                provider=EmbeddingProvider.VOYAGE,
                name="Voyage Law 2",
                dimensions=1024,
                max_input_length=16000,
            ),
            # Mistral Models
            cls.MISTRAL_EMBED.value: EmbeddingModelConfig(
                id=cls.MISTRAL_EMBED.value,
                provider=EmbeddingProvider.MISTRAL,
                name="Mistral Embed",
                dimensions=1024,
                max_input_length=8191,
            ),
            # Gemini Models
            cls.GEMINI_TEXT_EMBEDDING.value: EmbeddingModelConfig(
                id=cls.GEMINI_TEXT_EMBEDDING.value,
                provider=EmbeddingProvider.GEMINI,
                name="Gemini Text Embedding",
                dimensions=768,
                max_input_length=3072,
            ),
        }
        return model_registry.get(model_id)


@async_retry(
    wait=wait_random_exponential(min=30, max=120),
    stop=stop_after_attempt(3),
)
async def get_single_text_embedding(
    text: str,
    model: str,
    dimensions: Optional[int] = None,
    api_key: Optional[str] = None,
    encoding_format: Optional[CohereEncodingFormat] = None,
) -> List[float]:
    """Get embeddings for a single text using the specified model."""
    try:
        model_info = EmbeddingModels.get_model_info(model)
        if not model_info:
            raise ValueError(f"Unknown model: {model}")

        # Truncate text if needed
        if len(text) > model_info.max_input_length:
            text = text[: model_info.max_input_length]

        # Prepare kwargs for litellm
        kwargs = {
            "model": model,
            "input": text,
        }

        # Add optional parameters
        if dimensions:
            kwargs["dimensions"] = dimensions
        if api_key:
            kwargs["api_key"] = api_key
        if encoding_format and model_info.provider == EmbeddingProvider.COHERE:
            if (
                not model_info.supported_encoding_formats
                or encoding_format not in model_info.supported_encoding_formats
            ):
                raise ValueError(
                    f"Encoding format {encoding_format} not supported for model {model}"
                )
            kwargs["encoding_format"] = encoding_format

        response = await aembedding(**kwargs)
        return response.data[0]["embedding"]

    except Exception as e:
        logging.error(f"Error getting embedding: {str(e)}")
        raise


@async_retry(
    wait=wait_random_exponential(min=30, max=120),
    stop=stop_after_attempt(3),
)
async def get_multiple_text_embeddings(
    docs: List[Any],
    model: str,
    dimensions: Optional[int] = None,
    text_extractor: Optional[Callable[[Any], str]] = None,
    api_key: Optional[str] = None,
    batch_size: int = 100,
    encoding_format: Optional[CohereEncodingFormat] = None,
) -> EmbeddingArray:
    """Compute embeddings for a list of documents."""
    if text_extractor:
        texts = [text_extractor(doc) for doc in docs]
    else:
        if all(isinstance(doc, str) for doc in docs):
            texts = docs
        else:
            logging.error(
                "Documents must be strings or you must provide a text_extractor function."
            )
            return np.array([], dtype=np.float32)

    # Process in batches
    all_embeddings: List[List[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        try:
            # Prepare kwargs for litellm
            kwargs: Dict[str, Union[str, List[str], int]] = {
                "model": model,
                "input": batch,
            }
            # Add optional parameters
            if dimensions:
                kwargs["dimensions"] = dimensions
            if api_key:
                kwargs["api_key"] = api_key
            if encoding_format:
                model_info = EmbeddingModels.get_model_info(model)
                if model_info and model_info.provider == EmbeddingProvider.COHERE:
                    if (
                        not model_info.supported_encoding_formats
                        or encoding_format not in model_info.supported_encoding_formats
                    ):
                        raise ValueError(
                            f"Encoding format {encoding_format} not supported for model {model}"
                        )
                    kwargs["encoding_format"] = encoding_format.value

            # Log the request details
            logging.debug(f"[DEBUG] Requesting embeddings for batch of size {len(batch)}")
            logging.debug(f"[DEBUG] First text in batch (truncated): {batch[0][:100]}...")
            logging.debug(f"[DEBUG] Using model: {model}")

            response: EmbeddingResponse = await aembedding(**kwargs)
            batch_embeddings: List[List[float]] = [item["embedding"] for item in response.data]
            all_embeddings.extend(batch_embeddings)
            logging.debug(f"[DEBUG] Batch embeddings length: {len(batch_embeddings)}")
            logging.debug(f"[DEBUG] First embedding sample: {batch_embeddings[0][:5]}")
            # Validate embeddings
            for i, emb in enumerate(batch_embeddings):
                if not emb or len(emb) == 0:
                    raise ValueError(f"Empty embedding received for text at index {i}")
                if all(v == 0 for v in emb):
                    raise ValueError(f"All-zero embedding received for text at index {i}")

            # Log success
            logging.debug(f"Successfully processed batch of {len(batch)} texts")

        except Exception as e:
            logging.error(f"Error obtaining embeddings for batch: {str(e)}")
            logging.error("Batch details:")
            logging.error(f"- Batch size: {len(batch)}")
            logging.error(f"- Model: {model}")
            logging.error(f"- First text (truncated): {batch[0][:100]}...")
            raise  # Re-raise the exception to be handled by the retry decorator

    return np.array(all_embeddings, dtype=np.float32)


def cosine_similarity(a: EmbeddingArray, b: EmbeddingArray) -> EmbeddingArray:
    """Compute cosine similarity between two sets of vectors."""
    norm_a = np.linalg.norm(a, axis=1)
    norm_b = np.linalg.norm(b, axis=1)
    return np.dot(a, b.T) / np.outer(norm_a, norm_b)


async def find_top_k_similar_documents(
    query_docs: List[Any],
    candidate_docs: List[Any],
    model: str,
    k: int = 5,
    dimensions: Optional[int] = None,
    text_extractor: Optional[Callable[[Any], str]] = None,
    id_extractor: Optional[Callable[[Any], Any]] = None,
    api_key: Optional[str] = None,
    encoding_format: Optional[CohereEncodingFormat] = None,
) -> Dict[Any, List[Dict[str, Any]]]:
    """Find top k similar documents from candidate_docs for each query doc."""
    query_embeddings: EmbeddingArray = await get_multiple_text_embeddings(
        query_docs,
        model=model,
        dimensions=dimensions,
        text_extractor=text_extractor,
        api_key=api_key,
        encoding_format=encoding_format,
    )
    candidate_embeddings: EmbeddingArray = await get_multiple_text_embeddings(
        candidate_docs,
        model=model,
        dimensions=dimensions,
        text_extractor=text_extractor,
        api_key=api_key,
        encoding_format=encoding_format,
    )

    similarity_matrix = cosine_similarity(query_embeddings, candidate_embeddings)
    top_k_indices = np.argsort(-similarity_matrix, axis=1)[:, :k]

    top_k_similar_docs: Dict[Any, List[Dict[str, Any]]] = {}
    for i, query_doc in enumerate(query_docs):
        similar_docs = [
            {
                "document": candidate_docs[idx],
                "similarity_score": float(similarity_matrix[i][idx]),
            }
            for idx in top_k_indices[i]
        ]
        key = id_extractor(query_doc) if id_extractor else i
        top_k_similar_docs[key] = similar_docs
    return top_k_similar_docs

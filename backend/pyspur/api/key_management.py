import os
from typing import Dict, List, Optional

from dotenv import dotenv_values, load_dotenv, set_key, unset_key
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..rag.datastore.factory import VectorStoreConfig, get_vector_stores
from ..rag.embedder import EmbeddingModelConfig, EmbeddingModels

# Load existing environment variables from the .env file
load_dotenv(".env")

router = APIRouter()


class ProviderParameter(BaseModel):
    name: str
    description: str
    required: bool = True
    type: str = "password"  # password, text, select


class ProviderConfig(BaseModel):
    id: str
    name: str
    description: str
    category: str  # 'llm', 'embedding', 'vectorstore'
    parameters: List[ProviderParameter]
    icon: str = "database"  # Default icon for vector stores


PROVIDER_CONFIGS = [
    # LLM Providers
    ProviderConfig(
        id="openai",
        name="OpenAI",
        description="OpenAI's GPT models",
        category="llm",
        icon="openai",
        parameters=[
            ProviderParameter(name="OPENAI_API_KEY", description="OpenAI API Key"),
        ],
    ),
    ProviderConfig(
        id="azure-openai",
        name="Azure OpenAI",
        description="Azure-hosted OpenAI models",
        category="llm",
        icon="azure",
        parameters=[
            ProviderParameter(name="AZURE_OPENAI_API_KEY", description="Azure OpenAI API Key"),
            ProviderParameter(
                name="AZURE_OPENAI_ENDPOINT",
                description="Azure OpenAI Endpoint URL",
                type="text",
            ),
            ProviderParameter(
                name="AZURE_OPENAI_API_VERSION",
                description="API Version (e.g. 2023-05-15)",
                type="text",
            ),
        ],
    ),
    ProviderConfig(
        id="anthropic",
        name="Anthropic",
        description="Anthropic's Claude models",
        category="llm",
        icon="anthropic",
        parameters=[
            ProviderParameter(name="ANTHROPIC_API_KEY", description="Anthropic API Key"),
        ],
    ),
    ProviderConfig(
        id="gemini",
        name="Google Gemini",
        description="Google's Gemini models",
        category="llm",
        icon="google",
        parameters=[
            ProviderParameter(name="GEMINI_API_KEY", description="Google AI API Key"),
        ],
    ),
    ProviderConfig(
        id="deepseek",
        name="DeepSeek",
        description="DeepSeek's code and chat models",
        category="llm",
        icon="deepseek",
        parameters=[
            ProviderParameter(name="DEEPSEEK_API_KEY", description="DeepSeek API Key"),
        ],
    ),
    ProviderConfig(
        id="cohere",
        name="Cohere",
        description="Cohere's language models",
        category="llm",
        icon="cohere",
        parameters=[
            ProviderParameter(name="COHERE_API_KEY", description="Cohere API Key"),
        ],
    ),
    ProviderConfig(
        id="voyage",
        name="Voyage AI",
        description="Voyage's language models",
        category="llm",
        icon="voyage",
        parameters=[
            ProviderParameter(name="VOYAGE_API_KEY", description="Voyage AI API Key"),
        ],
    ),
    ProviderConfig(
        id="mistral",
        name="Mistral AI",
        description="Mistral's language models",
        category="llm",
        icon="mistral",
        parameters=[
            ProviderParameter(name="MISTRAL_API_KEY", description="Mistral AI API Key"),
        ],
    ),
    # Vector Store Providers
    ProviderConfig(
        id="pinecone",
        name="Pinecone",
        description="Production-ready vector database",
        category="vectorstore",
        icon="pinecone",
        parameters=[
            ProviderParameter(name="PINECONE_API_KEY", description="Pinecone API Key"),
            ProviderParameter(
                name="PINECONE_ENVIRONMENT",
                description="Pinecone Environment",
                type="text",
            ),
            ProviderParameter(
                name="PINECONE_INDEX",
                description="Pinecone Index Name",
                type="text",
            ),
        ],
    ),
    ProviderConfig(
        id="weaviate",
        name="Weaviate",
        description="Multi-modal vector search engine",
        category="vectorstore",
        icon="weaviate",
        parameters=[
            ProviderParameter(name="WEAVIATE_API_KEY", description="Weaviate API Key"),
            ProviderParameter(
                name="WEAVIATE_URL",
                description="Weaviate Instance URL",
                type="text",
            ),
        ],
    ),
    ProviderConfig(
        id="qdrant",
        name="Qdrant",
        description="Vector database for production",
        category="vectorstore",
        icon="qdrant",
        parameters=[
            ProviderParameter(name="QDRANT_API_KEY", description="Qdrant API Key"),
            ProviderParameter(
                name="QDRANT_URL",
                description="Qdrant Instance URL",
                type="text",
            ),
        ],
    ),
    ProviderConfig(
        id="chroma",
        name="Chroma",
        description="Open-source embedding database",
        category="vectorstore",
        icon="chroma",
        parameters=[
            ProviderParameter(
                name="CHROMA_IN_MEMORY",
                description="Run Chroma in memory",
                type="text",
            ),
            ProviderParameter(
                name="CHROMA_PERSISTENCE_DIR",
                description="Directory for Chroma persistence",
                type="text",
            ),
            ProviderParameter(
                name="CHROMA_HOST",
                description="Chroma server host",
                type="text",
            ),
            ProviderParameter(
                name="CHROMA_PORT",
                description="Chroma server port",
                type="text",
            ),
            ProviderParameter(
                name="CHROMA_COLLECTION",
                description="Chroma collection name",
                type="text",
            ),
        ],
    ),
    ProviderConfig(
        id="supabase",
        name="Supabase",
        description="Open-source vector database",
        category="vectorstore",
        icon="supabase",
        parameters=[
            ProviderParameter(
                name="SUPABASE_URL",
                description="Supabase Project URL",
                type="text",
            ),
            ProviderParameter(
                name="SUPABASE_ANON_KEY",
                description="Supabase Anonymous Key",
                type="password",
                required=False,
            ),
            ProviderParameter(
                name="SUPABASE_SERVICE_ROLE_KEY",
                description="Supabase Service Role Key",
                type="password",
                required=False,
            ),
        ],
    ),
    # Add Reddit Provider
    ProviderConfig(
        id="reddit",
        name="Reddit",
        description="Reddit API integration",
        category="social",
        icon="logos:reddit-icon",
        parameters=[
            ProviderParameter(name="REDDIT_CLIENT_ID", description="Reddit API Client ID"),
            ProviderParameter(name="REDDIT_CLIENT_SECRET", description="Reddit API Client Secret"),
            ProviderParameter(
                name="REDDIT_USERNAME", description="Reddit Username", type="text", required=False
            ),
            ProviderParameter(
                name="REDDIT_PASSWORD",
                description="Reddit Password",
                type="password",
                required=False,
            ),
            ProviderParameter(
                name="REDDIT_USER_AGENT",
                description="Reddit API User Agent",
                type="text",
                required=False,
            ),
        ],
    ),
    # Add Firecrawl Provider
    ProviderConfig(
        id="firecrawl",
        name="Firecrawl",
        description="Web scraping and crawling service",
        category="scraping",
        icon="solar:spider-bold",
        parameters=[
            ProviderParameter(name="FIRECRAWL_API_KEY", description="Firecrawl API Key"),
        ],
    ),
    # Add Slack Provider
    ProviderConfig(
        id="slack",
        name="Slack",
        description="Slack messaging and notification service",
        category="messaging",
        icon="logos:slack-icon",
        parameters=[
            ProviderParameter(name="SLACK_BOT_TOKEN", description="Slack Bot User OAuth Token"),
            ProviderParameter(
                name="SLACK_USER_TOKEN",
                description="Slack User OAuth Token",
                required=False,
            ),
        ],
    ),
    # Add Exa Provider
    ProviderConfig(
        id="exa",
        name="Exa",
        description="Exa web search API",
        category="search",
        icon="solar:search-bold",
        parameters=[
            ProviderParameter(name="EXA_API_KEY", description="Exa API Key"),
        ],
    ),
]

# For backward compatibility, create a flat list of all parameter names
MODEL_PROVIDER_KEYS = [
    {"name": param.name, "value": ""} for config in PROVIDER_CONFIGS for param in config.parameters
]


class APIKey(BaseModel):
    name: str
    value: Optional[str] = None


def get_all_env_variables() -> Dict[str, str | None]:
    return dotenv_values(".env")


def get_env_variable(name: str) -> Optional[str]:
    return os.getenv(name)


def set_env_variable(name: str, value: str):
    """Sets an environment variable both in the .env file and in the current process.
    Also ensures the value is properly quoted if it contains special characters.
    """
    # Ensure the value is properly quoted if it contains spaces or special characters
    if any(c in value for c in " '\"$&()|<>"):
        value = f'"{value}"'

    # Update the .env file using set_key
    set_key(".env", name, value)

    # Update the os.environ dictionary
    os.environ[name] = value

    # Force reload of environment variables
    load_dotenv(".env", override=True)


def delete_env_variable(name: str):
    # Remove the key from the .env file
    unset_key(".env", name)
    # Remove the key from os.environ
    os.environ.pop(name, None)


def mask_key_value(value: str, param_type: str = "password") -> str:
    """Masks the key value based on the parameter type.
    For password types, shows only the first and last few characters.
    For other types, shows the full value.
    """
    if param_type != "password":
        return value

    visible_chars = 4  # Number of characters to show at the start and end
    min_masked_chars = 4  # Minimum number of masked characters
    if len(value) <= visible_chars * 2 + min_masked_chars:
        return "*" * len(value)
    else:
        return (
            value[:visible_chars] + "*" * (len(value) - visible_chars * 2) + value[-visible_chars:]
        )


@router.get("/providers", description="Get all provider configurations")
async def get_providers():
    """Returns all provider configurations"""
    return PROVIDER_CONFIGS


@router.get("/", description="Get a list of all environment variable names")
async def list_api_keys():
    """Returns a list of all model provider keys"""
    return [k["name"] for k in MODEL_PROVIDER_KEYS]


@router.get(
    "/{name}",
    description="Get the masked value of a specific environment variable",
)
async def get_api_key(name: str):
    """Returns the masked value of the specified environment variable.
    Requires authentication.
    """
    # Find the parameter configuration
    param_type = "password"
    for config in PROVIDER_CONFIGS:
        for param in config.parameters:
            if param.name == name:
                param_type = param.type
                break

    if name not in [k["name"] for k in MODEL_PROVIDER_KEYS]:
        raise HTTPException(status_code=404, detail="Key not found")
    value = get_env_variable(name)
    if value is None:
        value = ""
    masked_value = mask_key_value(value, param_type)
    return APIKey(name=name, value=masked_value)


@router.post("/", description="Add or update an environment variable")
async def set_api_key(api_key: APIKey):
    """Adds a new environment variable or updates an existing one.
    Requires authentication.
    """
    if api_key.name not in [k["name"] for k in MODEL_PROVIDER_KEYS]:
        raise HTTPException(status_code=404, detail="Key not found")
    if not api_key.value:
        raise HTTPException(status_code=400, detail="Value is required")
    set_env_variable(api_key.name, api_key.value)
    return {"message": f"Key '{api_key.name}' set successfully"}


@router.delete("/{name}", description="Delete an environment variable")
async def delete_api_key(name: str):
    """Deletes the specified environment variable.
    Requires authentication.
    """
    if name not in [k["name"] for k in MODEL_PROVIDER_KEYS]:
        raise HTTPException(status_code=404, detail="Key not found")
    if get_env_variable(name) is None:
        raise HTTPException(status_code=404, detail="Key not found")
    delete_env_variable(name)
    return {"message": f"Key '{name}' deleted successfully"}


@router.get("/embedding-models/", response_model=Dict[str, EmbeddingModelConfig])
async def get_embedding_models() -> Dict[str, EmbeddingModelConfig]:
    """Get all available embedding models and their configurations."""
    try:
        models: Dict[str, EmbeddingModelConfig] = {}
        for model in EmbeddingModels:
            model_info = EmbeddingModels.get_model_info(model.value)
            if model_info:
                # Find the corresponding provider config
                provider_config = next(
                    (p for p in PROVIDER_CONFIGS if p.id == model_info.provider.value.lower()),
                    None,
                )
                if provider_config:
                    # Add required environment variables from the provider config
                    model_info.required_env_vars = [
                        p.name for p in provider_config.parameters if p.required
                    ]
                models[model.value] = model_info
        return models
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vector-stores/", response_model=Dict[str, VectorStoreConfig])
async def get_vector_stores_endpoint() -> Dict[str, VectorStoreConfig]:
    """Get all available vector stores and their configurations."""
    try:
        stores = get_vector_stores()
        # Add required environment variables from provider configs
        for store_id, store in stores.items():
            provider_config = next((p for p in PROVIDER_CONFIGS if p.id == store_id), None)
            if provider_config:
                store.required_env_vars = [p.name for p in provider_config.parameters if p.required]
        return stores
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

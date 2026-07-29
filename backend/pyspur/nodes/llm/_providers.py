import os
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


MINIMAX_REGIONS = {
    "global_en": "GLOBAL_EN",
    "cn_zh": "CN_ZH",
}
MINIMAX_PROTOCOLS = {"openai", "anthropic"}


class OllamaOptions(BaseModel):
    """Options for Ollama API calls"""

    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Controls randomness in responses",
    )
    max_tokens: Optional[int] = Field(
        default=None, ge=0, description="Maximum number of tokens to generate"
    )
    top_p: Optional[float] = Field(
        default=0.9, ge=0.0, le=1.0, description="Nucleus sampling threshold"
    )
    top_k: Optional[int] = Field(
        default=None,
        ge=0,
        description="Number of tokens to consider for top-k sampling",
    )
    repeat_penalty: Optional[float] = Field(
        default=None, ge=0.0, description="Penalty for token repetition"
    )
    stop: Optional[list[str]] = Field(default=None, description="Stop sequences to end generation")
    response_format: Optional[str] = Field(default=None, description="Format of the response")

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary, excluding None values"""
        return {k: v for k, v in self.model_dump().items() if v is not None}


def setup_azure_configuration(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Helper function to configure Azure settings from environment variables.
    This strips the 'azure/' prefix from the model, removes any 'response_format'
    parameter, and verifies that required Azure keys are present.
    """
    # Remove the "azure/" prefix if present
    base_model = (
        kwargs["model"].replace("azure/", "")
        if kwargs["model"].startswith("azure/")
        else kwargs["model"]
    )
    azure_kwargs = kwargs.copy()
    azure_kwargs.pop("response_format", None)
    azure_kwargs.update(
        {
            "model": base_model,
            "api_key": os.getenv("AZURE_OPENAI_API_KEY"),
            "api_base": os.getenv("AZURE_OPENAI_API_BASE"),
            "api_version": os.getenv("AZURE_OPENAI_API_VERSION"),
            "deployment_id": os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
        }
    )
    required_config = ["api_key", "api_base", "api_version", "deployment_id"]
    missing_config = [key for key in required_config if not azure_kwargs.get(key)]
    if missing_config:
        raise ValueError(f"Missing Azure configuration for: {', '.join(missing_config)}")
    return azure_kwargs


def setup_minimax_configuration(model: str) -> Dict[str, Any]:
    """Resolve a MiniMax model to an existing LiteLLM compatible adapter.

    MiniMax exposes both OpenAI-compatible and Anthropic-compatible APIs. The
    public base URL is selected by region and protocol, while LiteLLM receives
    the underlying model ID and the matching compatible provider.
    """
    if not model.startswith("minimax/"):
        return {}

    region = os.getenv("MINIMAX_REGION", "global_en")
    region_key = MINIMAX_REGIONS.get(region)
    if region_key is None:
        allowed_regions = ", ".join(sorted(MINIMAX_REGIONS))
        raise ValueError(f"MINIMAX_REGION must be one of: {allowed_regions}")

    protocol = os.getenv("MINIMAX_PROTOCOL", "openai").lower()
    if protocol not in MINIMAX_PROTOCOLS:
        allowed_protocols = ", ".join(sorted(MINIMAX_PROTOCOLS))
        raise ValueError(f"MINIMAX_PROTOCOL must be one of: {allowed_protocols}")

    env_name = f"MINIMAX_{region_key}_{protocol.upper()}_API_BASE"
    api_base = os.getenv(env_name, "").rstrip("/")
    expected_suffix = "/anthropic" if protocol == "anthropic" else "/v1"
    if not api_base:
        raise ValueError(f"Missing MiniMax configuration for: {env_name}")
    if not api_base.endswith(expected_suffix):
        raise ValueError(f"{env_name} must end with {expected_suffix}")

    request = {
        "model": model.removeprefix("minimax/"),
        "custom_llm_provider": protocol,
        "api_base": api_base,
    }
    api_key = os.getenv("MINIMAX_API_KEY")
    if api_key:
        request["api_key"] = api_key
    return request

import os
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


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

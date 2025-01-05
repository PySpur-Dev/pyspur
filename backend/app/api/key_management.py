from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
from dotenv import load_dotenv, set_key, unset_key, dotenv_values
import os

# Load existing environment variables from the .env file
load_dotenv(".env")

router = APIRouter()


DEFAULT_KEYS = [
    {"name": "OPENAI_API_KEY", "value": ""},
    {"name": "OPENAI_BASE_URL", "value": ""},
    {"name": "ANTHROPIC_API_KEY", "value": ""},
    {"name": "GEMINI_API_KEY", "value": ""},
]


class APIKey(BaseModel):
    name: str
    value: Optional[str] = None


def get_all_env_variables() -> Dict[str, str | None]:
    return dotenv_values(".env")


def get_env_variable(name: str) -> Optional[str]:
    return os.getenv(name)


def set_env_variable(name: str, value: str):
    # Update the .env file using set_key
    set_key(".env", name, value)
    # Update the os.environ dictionary
    os.environ[name] = value


def delete_env_variable(name: str):
    # Remove the key from the .env file
    unset_key(".env", name)
    # Remove the key from os.environ
    os.environ.pop(name, None)


def mask_key_value(value: str) -> str:
    """
    Masks the key value, showing only the first and last few characters,
    and replacing the middle part with asterisks.
    """
    visible_chars = 4  # Number of characters to show at the start and end
    min_masked_chars = 4  # Minimum number of masked characters
    if len(value) <= visible_chars * 2 + min_masked_chars:
        return "*" * len(value)
    else:
        return (
            value[:visible_chars]
            + "*" * (len(value) - visible_chars * 2)
            + value[-visible_chars:]
        )


@router.get("/", description="Get a list of all environment variable names")
async def list_api_keys():
    """
    Returns a list of all environment variable names without revealing their values.
    """
    env_vars = get_all_env_variables()
    all_keys = set([k["name"] for k in DEFAULT_KEYS]) | set(env_vars.keys())
    return {"keys": list(all_keys)}


@router.get(
    "/{name}", description="Get the masked value of a specific environment variable"
)
async def get_api_key(name: str):
    """
    Returns the masked value of the specified environment variable.
    Requires authentication.
    """
    value = get_env_variable(name)
    if value is None:
        if name not in [k["name"] for k in DEFAULT_KEYS]:
            raise HTTPException(status_code=404, detail="Key not found")
        else:
            value = ""
    masked_value = mask_key_value(value)
    return APIKey(name=name, value=masked_value)


@router.post("/", description="Add or update an environment variable")
async def set_api_key(api_key: APIKey):
    """
    Adds a new environment variable or updates an existing one.
    Requires authentication.
    """
    if not api_key.value:
        raise HTTPException(status_code=400, detail="Value is required")
    set_env_variable(api_key.name, api_key.value)
    return {"message": f"Key '{api_key.name}' set successfully"}


@router.delete("/{name}", description="Delete an environment variable")
async def delete_api_key(name: str):
    """
    Deletes the specified environment variable.
    Requires authentication.
    """
    if get_env_variable(name) is None:
        raise HTTPException(status_code=404, detail="Key not found")
    delete_env_variable(name)
    return {"message": f"Key '{name}' deleted successfully"}

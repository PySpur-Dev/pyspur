import json
import os
import time

# Import the logger
from logging import getLogger
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

logger = getLogger(__name__)

# Define a router for Google OAuth
router = APIRouter()

PROJECT_ROOT = os.getenv("PROJECT_ROOT", os.getcwd())
BASE_DIR = Path(PROJECT_ROOT) / "credentials" / "google"

# Default file paths for credentials and tokens.
TOKEN_FILE_PATH = BASE_DIR / "token.json"


class TokenInput(BaseModel):
    access_token: str
    expires_in: int


@router.post("/store_token/")
async def store_token(token: TokenInput):
    try:
        TOKEN_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(TOKEN_FILE_PATH, "w") as token_file:
            current_time = time.time()
            token_data = {
                "access_token": token.access_token,
                "expires_at": current_time + token.expires_in,
            }
            json.dump(token_data, token_file)
        return {"message": "Token stored successfully!"}
    except Exception as e:
        logger.error(f"Error storing token: {e}")
        return {"message": "Error storing token!"}


@router.get("/validate_token/")
async def validate_token():
    try:
        if not TOKEN_FILE_PATH.exists():
            # If the token file does not exist, return False
            return {"is_valid": False}

        with open(TOKEN_FILE_PATH, "r") as token_file:
            token_data = json.load(token_file)
            expires_at = token_data.get("expires_at")
            if expires_at is None:
                return {"is_valid": False}

            # Check if the token has expired
            if expires_at <= time.time():
                return {"is_valid": False}

            return {"is_valid": True}
    except Exception as e:
        logger.error(f"Error checking token: {e}")
        # In case of an exception, assume the token is invalid
        return {"is_valid": False}

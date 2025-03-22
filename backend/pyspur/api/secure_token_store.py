import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Dict, Optional

from cryptography.fernet import Fernet
from fastapi import HTTPException


class SecureTokenStore:
    """A secure storage for agent-specific tokens.

    This class provides an interface to securely store and retrieve
    tokens associated with specific agents, using encryption.
    """

    def __init__(self):
        # Ensure the token storage directory exists
        storage_dir = Path("./secure_tokens")
        try:
            storage_dir.mkdir(exist_ok=True)
            print(f"Ensured token storage directory exists: {storage_dir}")
        except Exception as e:
            print(f"Error creating token storage directory: {str(e)}")
            # Use a fallback directory in the current working directory
            storage_dir = Path.cwd() / "secure_tokens"
            storage_dir.mkdir(exist_ok=True)
            print(f"Using fallback token storage directory: {storage_dir}")

        self.storage_path = storage_dir / "agent_tokens.enc"
        key_path = storage_dir / "encryption_key.txt"
        print(f"Token storage path: {self.storage_path}")

        # Try to load encryption key from environment first
        self.encryption_key = os.getenv("TOKEN_ENCRYPTION_KEY")

        # If not in environment, try to load from file
        if not self.encryption_key and key_path.exists():
            try:
                print(f"Loading encryption key from file: {key_path}")
                self.encryption_key = key_path.read_text().strip()
                print("Successfully loaded encryption key from file")
            except Exception as e:
                print(f"Error loading encryption key from file: {str(e)}")
                self.encryption_key = None

        # If still no key, generate a new one and save it
        if not self.encryption_key:
            print("No encryption key found, generating a new one")
            self.encryption_key = Fernet.generate_key().decode()

            # Save the key to environment
            os.environ["TOKEN_ENCRYPTION_KEY"] = self.encryption_key

            # Also save to file for persistence between restarts
            try:
                print(f"Saving encryption key to file: {key_path}")
                key_path.write_text(self.encryption_key)
                print("Successfully saved encryption key to file")
            except Exception as e:
                print(f"Error saving encryption key to file: {str(e)}")
        else:
            print("Using existing encryption key")

        try:
            # Initialize Fernet cipher for encryption/decryption
            self.cipher = Fernet(self.encryption_key.encode())
        except Exception as e:
            print(f"Error initializing Fernet cipher: {str(e)}")
            # Generate a new key as fallback
            print("Generating new encryption key as fallback")
            self.encryption_key = Fernet.generate_key().decode()
            os.environ["TOKEN_ENCRYPTION_KEY"] = self.encryption_key
            # Save to file
            try:
                key_path.write_text(self.encryption_key)
            except Exception as e:
                print(f"Error saving fallback encryption key to file: {str(e)}")
            self.cipher = Fernet(self.encryption_key.encode())

        # Initialize or load the token store
        self.tokens: Dict[str, Dict[str, str]] = {}
        self._load_tokens()

    def _load_tokens(self):
        """Load tokens from encrypted storage file."""
        if not self.storage_path.exists():
            print(f"Loading tokens from {self.storage_path}")
            print("Token file does not exist yet, starting with empty store")
            return

        print(f"Loading tokens from {self.storage_path}")

        try:
            # Read and decrypt the token data
            encrypted_data = self.storage_path.read_bytes()
            print(f"Read {len(encrypted_data)} bytes of encrypted data")

            if len(encrypted_data) == 0:
                print("Token file is empty, starting with empty store")
                return

            try:
                # Try to decrypt with current key
                decrypted_data = self.cipher.decrypt(encrypted_data)
                self.tokens = json.loads(decrypted_data.decode("utf-8"))
                print(f"Successfully loaded tokens for {len(self.tokens)} agents")
            except Exception as e:
                # If decryption fails, back up the file and log the error
                print(f"Error decrypting token data: {str(e)}")
                print("File may have been encrypted with a different key or be corrupted.")

                backup_path = f"{self.storage_path}.bak.{int(time.time())}"
                try:
                    shutil.copy(self.storage_path, backup_path)
                    print(f"Moved potentially corrupted token file to {backup_path}")
                except Exception as be:
                    print(f"Error backing up token file: {str(be)}")

                # Keep the in-memory tokens intact (empty or previously loaded)
                print("Continuing with current in-memory tokens")

        except Exception as e:
            print(f"Error loading token file: {str(e)}")
            # Keep the in-memory tokens intact (empty or previously loaded)

    def _save_tokens(self):
        """Save encrypted tokens to storage."""
        try:
            import json

            data = json.dumps(self.tokens)
            encrypted_data = self.cipher.encrypt(data.encode())
            self.storage_path.write_bytes(encrypted_data)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save tokens: {str(e)}")

    def create_token_id(self, agent_id: int) -> str:
        """Generate a unique token ID for an agent."""
        token_id = str(uuid.uuid4())
        if str(agent_id) not in self.tokens:
            self.tokens[str(agent_id)] = {}
        self.tokens[str(agent_id)]["token_id"] = token_id
        self._save_tokens()
        return token_id

    def store_token(self, agent_id: int, token_type: str, token: str) -> str:
        """Store a token for an agent"""
        key = f"{agent_id}"
        if key not in self.tokens:
            self.tokens[key] = {}

        token_key = token_type
        self.tokens[key][token_key] = token

        try:
            # Try to save tokens
            self._save_tokens()
        except Exception as e:
            print(f"Error saving token: {str(e)}")
            # If saving fails, try to reset the tokens file and save again
            try:
                print("Attempting to reset token file and save again")
                self.reset_tokens_file()
                self._save_tokens()
            except Exception as e2:
                print(f"Error after reset attempt: {str(e2)}")

        return self._mask_token(token)

    def reset_tokens_file(self):
        """Reset the tokens file, for cases where the encryption key has changed"""
        # Backup current file if it exists
        if self.storage_path.exists():
            backup_path = f"{self.storage_path}.bak.{int(time.time())}"
            try:
                shutil.copy(self.storage_path, backup_path)
                print(f"Backed up token file to {backup_path}")
            except Exception as e:
                print(f"Error backing up token file: {str(e)}")

        # Delete the current file
        try:
            if self.storage_path.exists():
                self.storage_path.unlink()
                print(f"Deleted token file: {self.storage_path}")
        except Exception as e:
            print(f"Error deleting token file: {str(e)}")

        # We keep the in-memory tokens that we've loaded or newly added

    def get_token(self, agent_id: int, token_type: str) -> Optional[str]:
        """Retrieve a token for a specific agent and token type."""
        print(f"Retrieving {token_type} for agent {agent_id}")

        agent_id_str = str(agent_id)
        if agent_id_str not in self.tokens:
            print(f"No tokens found for agent {agent_id} (agent not found in token store)")
            return None

        if token_type not in self.tokens[agent_id_str]:
            print(f"No {token_type} found for agent {agent_id}")
            available_types = ", ".join(self.tokens[agent_id_str].keys())
            print(f"Available token types for agent {agent_id}: {available_types}")
            return None

        token = self.tokens[agent_id_str][token_type]
        masked_token = self._mask_token(token)
        print(f"Retrieved {token_type} for agent {agent_id}: {masked_token}")
        return token

    def delete_token(self, agent_id: int, token_type: str) -> bool:
        """Delete a token for a specific agent and token type."""
        agent_id_str = str(agent_id)
        if agent_id_str in self.tokens and token_type in self.tokens[agent_id_str]:
            del self.tokens[agent_id_str][token_type]
            if not self.tokens[agent_id_str]:  # If no tokens left for this agent
                del self.tokens[agent_id_str]
            self._save_tokens()
            return True
        return False

    def _mask_token(self, token: str) -> str:
        """Create a masked version of the token for display."""
        if len(token) <= 8:
            return "*" * len(token)
        return token[:4] + "*" * (len(token) - 8) + token[-4:]


# Singleton instance
_token_store = None


def get_token_store() -> SecureTokenStore:
    """Get the singleton token store instance."""
    global _token_store
    if _token_store is None:
        _token_store = SecureTokenStore()
    return _token_store

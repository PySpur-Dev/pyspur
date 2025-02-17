import base64
import mimetypes
from pathlib import Path


def encode_file_to_base64_data_url(file_path: str) -> str:
    """
    Read a file and encode it as a base64 data URL with the appropriate MIME type.
    """
    path = Path(file_path)
    mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"

    with open(path, "rb") as f:
        file_content = f.read()
        base64_data = base64.b64encode(file_content).decode("utf-8")
        return f"data:{mime_type};base64,{base64_data}"


def get_file_mime_type(file_path: str) -> str:
    """
    Get the MIME type for a file based on its extension.
    """
    mime_type = mimetypes.guess_type(file_path)[0]
    if mime_type is None:
        # Default MIME types for common file types
        ext = Path(file_path).suffix.lower()
        mime_map = {
            ".pdf": "application/pdf",
            ".txt": "text/plain",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".mp3": "audio/mpeg",
            ".mp4": "video/mp4",
        }
        mime_type = mime_map.get(ext, "application/octet-stream")
    return mime_type

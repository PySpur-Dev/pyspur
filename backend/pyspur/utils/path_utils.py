from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def is_external_url(url: str) -> bool:
    return url.startswith(("http://", "https://", "gs://"))


def get_test_files_dir() -> Path:
    """Get the directory for test file uploads."""
    test_files_dir = Path.joinpath(PROJECT_ROOT, "data", "test_files")
    test_files_dir.mkdir(parents=True, exist_ok=True)
    return test_files_dir


def resolve_file_path(file_path: str) -> Path | str:
    """
    Resolve a file path relative to the project root.
    Expects paths in format 'data/test_files/S9/20250120_121759_aialy.pdf' and resolves them to
    '/pyspur/backend/data/test_files/S9/20250120_121759_aialy.pdf'
    If the path is an external URL (starts with http:// or https://), returns it as is.
    """
    # Handle external URLs
    if is_external_url(file_path):
        return file_path

    path = Path(file_path)
    if path.is_absolute():
        return path

    # Construct full path under test_files directory
    full_path = Path.joinpath(PROJECT_ROOT, "data", file_path)

    if not full_path.exists():
        raise FileNotFoundError(f"File not found at expected location: {full_path}")

    return full_path

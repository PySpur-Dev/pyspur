import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..schemas.file_schemas import FileResponseSchema

router = APIRouter()

# Define base data directory
DATA_DIR = Path("data")


@router.get(
    "/{workflow_id}",
    response_model=List[FileResponseSchema],
    description="List all files for a specific workflow",
)
async def list_workflow_files(workflow_id: str) -> List[FileResponseSchema]:
    """
    List all files in the workflow's directory.
    Returns a list of dictionaries containing file information.
    """
    workflow_dir = DATA_DIR / "run_files" / workflow_id

    if not workflow_dir.exists():
        return []

    files: List[FileResponseSchema] = []
    for file_path in workflow_dir.glob("*"):
        if file_path.is_file():
            files.append(
                FileResponseSchema(
                    name=file_path.name,
                    path=str(file_path.relative_to(DATA_DIR)),
                    size=os.path.getsize(file_path),
                    created=datetime.fromtimestamp(os.path.getctime(file_path), tz=timezone.utc),
                    workflow_id=workflow_id,
                )
            )

    return files


@router.get(
    "/",
    response_model=List[FileResponseSchema],
    description="List all files across all workflows",
)
async def list_all_files() -> List[FileResponseSchema]:
    """
    List all files in the data directory across all workflows.
    Returns a list of dictionaries containing file information.
    """
    test_files_dir = DATA_DIR / "run_files"

    if not test_files_dir.exists():
        return []

    files: List[FileResponseSchema] = []
    for workflow_dir in test_files_dir.glob("*"):
        if workflow_dir.is_dir():
            workflow_id = workflow_dir.name
            for file_path in workflow_dir.glob("*"):
                if file_path.is_file():
                    files.append(
                        FileResponseSchema(
                            name=file_path.name,
                            workflow_id=workflow_id,
                            path=str(file_path.relative_to(DATA_DIR)),
                            size=os.path.getsize(file_path),
                            created=datetime.fromtimestamp(
                                os.path.getctime(file_path), tz=timezone.utc
                            ),
                        )
                    )

    return files


@router.delete("/{workflow_id}/{filename}", description="Delete a specific file")
async def delete_file(workflow_id: str, filename: str):
    """
    Delete a specific file from a workflow's directory.
    """
    file_path = DATA_DIR / "run_files" / workflow_id / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        os.remove(file_path)
        return {"message": "File deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")


@router.delete("/{workflow_id}", description="Delete all files for a workflow")
async def delete_workflow_files(workflow_id: str):
    """
    Delete all files in a workflow's directory.
    """
    workflow_dir = DATA_DIR / "run_files" / workflow_id

    if not workflow_dir.exists():
        raise HTTPException(status_code=404, detail="Workflow directory not found")

    try:
        shutil.rmtree(workflow_dir)
        return {"message": "All workflow files deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting workflow files: {str(e)}")


@router.get(
    "/{file_path:path}",
    description="Get a specific file",
    response_class=FileResponse,
)
async def get_file(file_path: str):
    """
    Get a specific file from the data directory.
    Validates file path to prevent path traversal attacks.
    """
    # Validate that file_path doesn't contain path traversal patterns
    if ".." in file_path or "~" in file_path:
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Resolve the full path and ensure it's within DATA_DIR
    try:
        full_path = (DATA_DIR / file_path).resolve()
        if not str(full_path).startswith(str(DATA_DIR.resolve())):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file path")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(str(full_path))

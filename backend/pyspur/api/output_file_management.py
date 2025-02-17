from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.output_file_model import OutputFileModel
from ..schemas.output_file_schemas import OutputFileResponseSchema

router = APIRouter()


@router.get(
    "/",
    response_model=List[OutputFileResponseSchema],
    description="List all output files",
)
def list_output_files(
    db: Session = Depends(get_db),
) -> List[OutputFileResponseSchema]:
    output_files = db.query(OutputFileModel).all()
    output_file_list = [
        OutputFileResponseSchema(
            id=of.id,
            file_name=of.file_name,
            created_at=of.created_at,
            updated_at=of.updated_at,
        )
        for of in output_files
    ]
    return output_file_list


@router.get(
    "/{output_file_id}/",
    response_model=OutputFileResponseSchema,
    description="Get an output file by ID",
)
def get_output_file(output_file_id: str, db: Session = Depends(get_db)) -> OutputFileResponseSchema:
    output_file = db.query(OutputFileModel).filter(OutputFileModel.id == output_file_id).first()
    if not output_file:
        raise HTTPException(status_code=404, detail="Output file not found")
    return OutputFileResponseSchema(
        id=output_file.id,
        file_name=output_file.file_name,
        created_at=output_file.created_at,
        updated_at=output_file.updated_at,
    )


@router.delete(
    "/{output_file_id}/",
    description="Delete an output file by ID",
)
def delete_output_file(output_file_id: str, db: Session = Depends(get_db)):
    output_file = db.query(OutputFileModel).filter(OutputFileModel.id == output_file_id).first()
    if not output_file:
        raise HTTPException(status_code=404, detail="Output file not found")
    db.delete(output_file)
    db.commit()
    return {"message": "Output file deleted"}


# download_output_file endpoint
@router.get(
    "/{output_file_id}/download/",
    description="Download an output file by ID",
)
def download_output_file(output_file_id: str, db: Session = Depends(get_db)):
    output_file = db.query(OutputFileModel).filter(OutputFileModel.id == output_file_id).first()
    if not output_file:
        raise HTTPException(status_code=404, detail="Output file not found")

    # get the appropriate media type based on the file extension
    media_type = "application/octet-stream"
    if output_file.file_name.endswith(".csv"):
        media_type = "text/csv"
    elif output_file.file_name.endswith(".json"):
        media_type = "application/json"
    elif output_file.file_name.endswith(".txt"):
        media_type = "text/plain"
    elif output_file.file_name.endswith(".jsonl"):
        media_type = "application/x-ndjson"

    return FileResponse(
        output_file.file_path,
        media_type=media_type,
        filename=output_file.file_name,
        headers={"Content-Disposition": f"attachment; filename={output_file.file_name}"},
        content_disposition_type="attachment",
    )

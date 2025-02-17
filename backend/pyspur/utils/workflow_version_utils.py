import hashlib
import json

from sqlalchemy.orm import Session

from ..models.workflow_version_model import WorkflowVersionModel
from ..schemas.workflow_schemas import (
    WorkflowDefinitionSchema,
    WorkflowResponseSchema,
)


def get_latest_workflow_version(workflow_id: str, db: Session) -> int:
    """
    Retrieve the latest version number of a workflow.
    Returns the latest version number if it exists, otherwise 0.
    """
    latest_version = (
        db.query(WorkflowVersionModel)
        .filter(WorkflowVersionModel.workflow_id == workflow_id)
        .order_by(WorkflowVersionModel.version.desc())
        .first()
    )

    return latest_version.version if latest_version else 0


def hash_workflow_definition(definition: WorkflowDefinitionSchema) -> str:
    """
    Create a hash of the workflow definition for comparison.
    """
    definition_str = json.dumps(definition, sort_keys=True)
    return hashlib.sha256(definition_str.encode("utf-8")).hexdigest()


def fetch_workflow_version(
    workflow_id: str, workflow: WorkflowResponseSchema, db: Session
) -> WorkflowVersionModel:
    """
    Retrieve an existing workflow version with the same definition or create a new one.
    """
    definition_hash = hash_workflow_definition(workflow.definition)
    existing_version = (
        db.query(WorkflowVersionModel)
        .filter(
            WorkflowVersionModel.workflow_id == workflow_id,
            WorkflowVersionModel.definition_hash == definition_hash,
        )
        .first()
    )

    if existing_version:
        return existing_version

    latest_version_number = get_latest_workflow_version(workflow_id, db)
    new_version = WorkflowVersionModel(
        workflow_id=workflow_id,
        version=latest_version_number + 1,
        name=workflow.name,
        description=workflow.description,
        definition=workflow.definition,
        definition_hash=definition_hash,
    )
    db.add(new_version)
    db.commit()
    return new_version

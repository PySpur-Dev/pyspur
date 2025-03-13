from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user_session_model import SessionModel, UserModel
from ..models.workflow_model import WorkflowModel
from ..schemas.session_schemas import (
    SessionCreate,
    SessionListResponse,
    SessionResponse,
)

router = APIRouter()

TEST_USER_EXTERNAL_ID = "test_user"
TEST_USER_METADATA = {"is_test": True}


@router.post("/", response_model=SessionResponse)
async def create_session(
    session_create: SessionCreate,
    db: Session = Depends(get_db),
) -> SessionResponse:
    """Create a new session."""
    # Check if session already exists with the given external_id
    if session_create.external_id:
        existing_session = (
            db.query(SessionModel)
            .execution_options(join_depth=2)  # Include messages in response
            .filter(SessionModel.external_id == session_create.external_id)
            .first()
        )
        if existing_session:
            return SessionResponse.model_validate(existing_session)

    # Verify user exists
    user = db.query(UserModel).filter(UserModel.id == session_create.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify workflow exists
    workflow = (
        db.query(WorkflowModel).filter(WorkflowModel.id == session_create.workflow_id).first()
    )
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Create session
    session = SessionModel(
        user_id=session_create.user_id,
        workflow_id=session_create.workflow_id,
        external_id=session_create.external_id,
    )

    try:
        db.add(session)
        db.commit()
        db.refresh(session)
        return SessionResponse.model_validate(session)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Could not create session",
        ) from None


@router.get("/", response_model=SessionListResponse)
async def list_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    user_id: str | None = None,
    db: Session = Depends(get_db),
) -> SessionListResponse:
    """List sessions with pagination and optional user filtering."""
    query = select(SessionModel)

    if user_id:
        query = query.where(SessionModel.user_id == user_id)

    # Get total count
    total_count = cast(int, db.scalar(select(func.count()).select_from(query.subquery())))

    # Get paginated sessions
    sessions = (
        db.query(SessionModel)
        .execution_options(join_depth=2)  # Include messages in response
        .order_by(SessionModel.created_at.desc())
    )

    if user_id:
        sessions = sessions.filter(SessionModel.user_id == user_id)

    sessions = sessions.offset(skip).limit(limit).all()

    # Convert models to response schemas
    session_responses = [SessionResponse.model_validate(session) for session in sessions]
    return SessionListResponse(sessions=session_responses, total=total_count)


@router.get("/{session_id}/", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: Session = Depends(get_db),
) -> SessionResponse:
    """Get a specific session by ID."""
    session = (
        db.query(SessionModel)
        .execution_options(join_depth=2)  # Include messages in response
        .filter(SessionModel.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionResponse.model_validate(session)


@router.delete("/{session_id}/", status_code=204)
async def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
) -> None:
    """Delete a session."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.delete(session)
    db.commit()


@router.post("/test/", response_model=SessionResponse)
async def create_test_session(
    workflow_id: str,
    db: Session = Depends(get_db),
) -> SessionResponse:
    """Create or reuse a test user and session.

    If a test user exists, it will be reused.
    If an empty test session exists for the same workflow, it will be reused.
    Otherwise, a new session will be created.
    """
    # First verify workflow exists
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Get or create test user
    test_user = db.query(UserModel).filter(UserModel.external_id == TEST_USER_EXTERNAL_ID).first()

    if not test_user:
        test_user = UserModel(
            external_id=TEST_USER_EXTERNAL_ID,
            user_metadata=TEST_USER_METADATA,
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)

    # Look for an existing empty session for this workflow
    existing_session = (
        db.query(SessionModel)
        .filter(
            SessionModel.user_id == test_user.id,
            SessionModel.workflow_id == workflow_id,
        )
        .execution_options(join_depth=2)  # Include messages in response
        .order_by(SessionModel.created_at.desc())
        .first()
    )
    if existing_session and len(existing_session.messages) == 0:
        return SessionResponse.model_validate(existing_session)

    # Create new session
    session = SessionModel(user_id=test_user.id, workflow_id=workflow_id)
    try:
        db.add(session)
        db.commit()
        db.refresh(session)
        return SessionResponse.model_validate(session)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Could not create test session",
        ) from None

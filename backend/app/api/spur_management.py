from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from datetime import datetime, timezone
import secrets
from fastapi.openapi.models import Example

from ..database import get_db
from ..models.spur_model import SpurModel
from ..schemas.spur_schemas import SpurCreateSchema, SpurResponseSchema, RateLimitConfig
from ..utils.workflow_version_utils import fetch_workflow_version
from ..utils.rate_limiter import RateLimiter
from .workflow_run import run_workflow_non_blocking

router = APIRouter(
    tags=["Spur API Management"],
    responses={
        404: {"description": "Not found"},
        429: {"description": "Rate limit exceeded"},
    }
)

# Create rate limiter instance - 100 requests per minute per API key
rate_limiter = RateLimiter(calls=100, period=60)

# API key header for spur authentication
API_KEY_HEADER = APIKeyHeader(name="X-API-Key")

async def verify_api_key(
    api_key: str = Depends(API_KEY_HEADER),
    db: Session = Depends(get_db)
) -> SpurModel:
    """Verify API key and return associated Spur"""
    spur = db.query(SpurModel).filter(
        SpurModel.api_key == api_key,
        SpurModel.is_active == True
    ).first()
    if not spur:
        raise HTTPException(
            status_code=401,
            detail="Invalid or inactive API key"
        )

    # Check rate limit
    if not await rate_limiter.is_allowed(api_key):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please try again later."
        )

    return spur

@router.post(
    "/",
    response_model=SpurResponseSchema,
    summary="Create new Spur API deployment",
    description="""
    Create a new Spur API deployment from an existing workflow.
    This will generate a unique API key and create an endpoint that can be used to run the workflow.
    """,
    responses={
        201: {
            "description": "Successfully created Spur deployment",
            "content": {
                "application/json": {
                    "example": {
                        "id": "spur_123",
                        "name": "My API",
                        "api_key": "sk_test_123...",
                        "status": "active"
                    }
                }
            }
        }
    }
)
async def create_spur(
    spur: SpurCreateSchema,
    db: Session = Depends(get_db)
):
    """Create a new Spur API deployment"""
    # Get rate limit configuration from request or use defaults
    rate_limit = spur.rate_limit or RateLimitConfig()

    new_spur = SpurModel(
        name=spur.name,
        description=spur.description,
        workflow_id=spur.workflow_id,
        workflow_version_id=spur.workflow_version_id,
        api_key=secrets.token_urlsafe(32),
        created_at=datetime.now(timezone.utc),
        input_schema=spur.input_schema,
        output_schema=spur.output_schema,
        is_active=True,
        rate_limit_calls=rate_limit.calls,
        rate_limit_period=rate_limit.period
    )
    db.add(new_spur)
    db.commit()
    db.refresh(new_spur)

    # Convert to response schema with proper type conversions
    return SpurResponseSchema(
        id=str(new_spur.id),
        name=str(new_spur.name),
        description=str(new_spur.description) if new_spur.description else None,
        workflow_id=str(new_spur.workflow_id),
        workflow_version_id=str(new_spur.workflow_version_id) if new_spur.workflow_version_id else None,
        is_active=bool(new_spur.is_active),
        created_at=new_spur.created_at,
        api_key=str(new_spur.api_key),
        input_schema=dict(new_spur.input_schema) if new_spur.input_schema else {},
        output_schema=dict(new_spur.output_schema) if new_spur.output_schema else {},
        rate_limit=RateLimitConfig(
            calls=int(new_spur.rate_limit_calls),
            period=int(new_spur.rate_limit_period)
        )
    )

@router.post(
    "/{spur_id}/invoke",
    summary="Invoke Spur API endpoint",
    description="""
    Run the workflow associated with this Spur deployment.
    Requires a valid API key in the X-API-Key header.
    Returns a run ID that can be used to check the status of the workflow execution.
    """,
    responses={
        200: {
            "description": "Successfully started workflow execution",
            "content": {
                "application/json": {
                    "example": {
                        "run_id": "run_123",
                        "status": "pending"
                    }
                }
            }
        },
        429: {
            "description": "Rate limit exceeded",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Rate limit exceeded. Please try again later."
                    }
                }
            }
        }
    }
)
async def invoke_spur(
    spur_id: str,
    inputs: Dict[str, Any],
    background_tasks: BackgroundTasks,
    spur: SpurModel = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """Invoke a Spur API endpoint"""
    # Validate inputs against schema
    # TODO: Add input validation using spur.input_schema

    # Run the workflow
    run = await run_workflow_non_blocking(
        workflow_id=spur.workflow_id,
        start_run_request={"initial_inputs": inputs},
        background_tasks=background_tasks,
        run_type="spur",
        db=db
    )

    return {
        "run_id": run.id,
        "status": "pending"
    }

@router.get(
    "/{spur_id}/status",
    summary="Get Spur deployment status",
    description="Get the current status and configuration of a Spur deployment",
    responses={
        200: {
            "description": "Successfully retrieved Spur status",
            "content": {
                "application/json": {
                    "example": {
                        "id": "spur_123",
                        "status": "active",
                        "rate_limit": {
                            "calls": 100,
                            "period": 60
                        }
                    }
                }
            }
        }
    }
)
async def get_spur_status(
    spur_id: str,
    spur: SpurModel = Depends(verify_api_key),
):
    """Get status of a Spur deployment"""
    return {
        "id": spur.id,
        "status": "active" if spur.is_active else "inactive",
        "rate_limit": {
            "calls": rate_limiter.calls,
            "period": rate_limiter.period
        }
    }

@router.delete("/{spur_id}")
async def deactivate_spur(spur_id: str, db: Session = Depends(get_db)):
    """Deactivate a Spur deployment"""
    spur = db.query(SpurModel).filter(SpurModel.id == spur_id).first()
    if not spur:
        raise HTTPException(status_code=404, detail="Spur not found")
    spur.is_active = False
    db.commit()
    return {"message": "Spur deactivated successfully"}
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.workflow_model import WorkflowModel
from ..schemas.run_schemas import StartRunRequestSchema
from .workflow_run import run_workflow_blocking

router = APIRouter()


# Define the request schema for OpenAI-compatible chat completions
class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[Dict[str, Any]]
    functions: Optional[List[Dict[str, Any]]] = None
    function_call: Optional[Union[Dict[str, Any], str]] = None
    temperature: float = 0.7
    top_p: float = 0.9
    n: int = 1
    stream: bool = False
    stop: Optional[Union[str, List[str]]] = None
    max_tokens: Optional[int] = None
    presence_penalty: float = 0.0
    frequency_penalty: float = 0.0
    logit_bias: Optional[Dict[str, float]] = None
    user: Optional[str] = None


# Define the response schema for OpenAI-compatible chat completions
class ChatCompletionResponse(BaseModel):
    id: str
    object: str
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]


@router.post(
    "/v1/chat/completions",
    response_model=ChatCompletionResponse,
    description="OpenAI-compatible chat completions endpoint",
)
async def chat_completions(
    request: ChatCompletionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ChatCompletionResponse:
    """
    Mimics OpenAI's /v1/chat/completions endpoint for chat-based workflows.
    """
    # Fetch the workflow (model maps to workflow_id)
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == request.model).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Get the latest user message
    latest_user_message = next(
        (message["content"] for message in reversed(request.messages) if message["role"] == "user"),
        None,
    )
    if not latest_user_message:
        raise HTTPException(status_code=400, detail="No user message found in messages")

    # Prepare initial inputs with the latest user message
    initial_inputs = {"message": {"value": latest_user_message}}

    # Start a blocking workflow run with the initial inputs
    start_run_request = StartRunRequestSchema(
        initial_inputs=initial_inputs,
        parent_run_id=None,
    )
    outputs = await run_workflow_blocking(
        workflow_id=request.model,
        request=start_run_request,
        db=db,
        run_type="openai",
    )

    # Format the response with outputs from the workflow
    response = ChatCompletionResponse(
        id=f"chatcmpl-{datetime.now(timezone.utc).timestamp()}",
        object="chat.completion",
        created=int(datetime.now(timezone.utc).timestamp()),
        model=request.model,
        choices=[
            {
                "message": {
                    "role": "assistant",
                    "content": outputs.get("response", {}).get("value", ""),
                },
                "index": 0,
                "finish_reason": outputs.get("finish_reason", "stop"),
            }
        ],
        usage={
            "prompt_tokens": outputs.get("prompt_tokens", 0),
            "completion_tokens": outputs.get("completion_tokens", 0),
            "total_tokens": outputs.get("total_tokens", 0),
        },
    )
    return response

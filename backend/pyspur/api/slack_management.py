import asyncio
import json
import os
import traceback
from datetime import UTC, datetime
from typing import Any, Callable, Dict, List, Optional, cast

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from loguru import logger
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from sqlalchemy.orm import Session

from ..database import get_db
from ..integrations.slack.socket_client import get_socket_mode_client
from ..models.run_model import RunModel, RunStatus
from ..models.slack_agent_model import SlackAgentModel
from ..models.task_model import TaskStatus
from ..models.workflow_model import WorkflowModel
from ..schemas.run_schemas import StartRunRequestSchema
from ..schemas.slack_schemas import (
    AgentTokenRequest,
    AgentTokenResponse,
    SlackAgentCreate,
    SlackAgentResponse,
    SlackAgentUpdate,
    SlackMessage,
    SlackMessageResponse,
    SlackSocketModeResponse,
    SlackTriggerConfig,
    WorkflowAssociation,
    WorkflowTriggerRequest,
    WorkflowTriggerResult,
    WorkflowTriggersResponse,
)
from . import key_management
from .secure_token_store import get_token_store
from .workflow_run import run_workflow_non_blocking

router = APIRouter()

# API Endpoints
SLACK_API_URL = "https://slack.com/api"
SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage"

# Request timeout (in seconds)
REQUEST_TIMEOUT = 10

# Initialize the socket mode client and set up the workflow trigger callback
socket_mode_client = get_socket_mode_client()

# NOTE: Some type checking issues remain in this file related to:
# 1. SQLAlchemy Column types and boolean operations
# 2. slack_sdk.WebClient.chat_postMessage return types
# 3. Type annotations for list elements in trigger_keywords
# These are being suppressed with type: ignore where needed or using safe patterns.


def _validate_agent_socket_mode(
    db: Session, agent_id: int, say_callback: Optional[Callable[..., Any]] = None
) -> bool:
    """Validate if an agent should be processing socket mode events.

    Args:
        db: Database session
        agent_id: Agent ID to validate
        say_callback: Optional callback to send message if agent is disabled

    Returns:
        bool: True if agent should process events, False otherwise

    """
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()

    if not agent or not agent.socket_mode_enabled:
        logger.warning(f"Rejecting event for agent {agent_id} - socket_mode_enabled=False")

        # Send response to avoid hanging the client
        if say_callback:
            try:
                say_callback(text="This Slack integration is currently disabled.")
            except Exception:
                pass
        return False

    return True


# Callback function for socket mode events to trigger workflows
async def handle_socket_mode_event(
    trigger_request: WorkflowTriggerRequest,
    agent_id: int,
    say: Callable[..., Any],
    client: Optional[WebClient] = None,
):
    """Handle a socket mode event by triggering the associated workflow"""
    logger.info(f"Handling socket mode event for agent {agent_id}")

    # This function can be called from a thread or directly, so we need to handle both cases
    # Get a database session
    db = next(get_db())

    try:
        # First, explicitly check if this agent should actually be processing events
        if not _validate_agent_socket_mode(db, agent_id, say):
            return

        agent = await _get_active_agent(db, agent_id)
        if not agent:
            return

        if await _should_trigger_workflow(agent, trigger_request):
            await _trigger_workflow(db, agent, trigger_request, say, client)

    except Exception as e:
        logger.error(f"Error in handle_socket_mode_event: {e}")
        logger.error(f"Error details: {traceback.format_exc()}")
    finally:
        db.close()


# Create a synchronous version of the handler that can be called from threads
def handle_socket_mode_event_sync(
    trigger_request: WorkflowTriggerRequest,
    agent_id: int,
    say: Callable[..., Any],
    client: Optional[WebClient] = None,
):
    """Synchronous wrapper for handle_socket_mode_event to be used in threaded contexts"""
    # Return the coroutine object without awaiting it
    # The socket client will handle awaiting it appropriately
    return handle_socket_mode_event(trigger_request, agent_id, say, client)


async def _get_active_agent(db: Session, agent_id: int) -> Optional[SlackAgentModel]:
    """Get an active agent with workflow configured"""
    agent = (
        db.query(SlackAgentModel)
        .filter(
            SlackAgentModel.id == agent_id,
            SlackAgentModel.is_active.is_(True),
            SlackAgentModel.trigger_enabled.is_(True),
            SlackAgentModel.workflow_id.isnot(None),
        )
        .first()
    )

    if not agent:
        logger.warning(f"Agent {agent_id} not found, not active, or has no workflow")
    return agent


# Function to convert keywords list items to strings
def _convert_keywords_to_strings(keywords: List[str]) -> List[str]:
    """Convert all items in a keywords list to strings, filtering out None values."""
    return [str(k) for k in keywords if k is not None]


# Utility function to check for keyword matches in the message
async def _should_trigger_workflow(
    agent: SlackAgentModel, trigger_request: WorkflowTriggerRequest
) -> bool:
    """Determine if a Slack message should trigger a workflow."""
    # Only proceed if triggering is enabled for this agent
    try:
        # Use explicit conversion for all SQLAlchemy Column boolean fields
        trigger_enabled = (
            bool(agent.trigger_enabled) if agent.trigger_enabled is not None else False
        )
        if not trigger_enabled:
            return False

        should_trigger = False

        # Check mention trigger - convert SQLAlchemy Column to bool for comparison
        trigger_on_mention = (
            bool(agent.trigger_on_mention) if agent.trigger_on_mention is not None else False
        )
        if trigger_on_mention and trigger_request.event_type == "app_mention":
            should_trigger = True
        # Check direct message trigger
        elif (
            (
                bool(agent.trigger_on_direct_message)
                if agent.trigger_on_direct_message is not None
                else False
            )
            and trigger_request.event_type == "message"
            and trigger_request.event_data.get("channel_type") == "im"
        ):
            should_trigger = True
        # Check channel message trigger
        elif (
            (
                bool(agent.trigger_on_channel_message)
                if agent.trigger_on_channel_message is not None
                else False
            )
            and trigger_request.event_type == "message"
            and trigger_request.event_data.get("channel_type") != "im"
        ):
            # For channel messages, we need to check for keywords
            keywords = agent.trigger_keywords
            if keywords and isinstance(keywords, list):
                # Convert keywords to list of strings
                str_keywords: List[str] = []
                for item in keywords:  # type: ignore  # SQLAlchemy JSON type is hard to properly type
                    if item is not None:
                        str_keywords.append(str(item))

                if str_keywords:
                    message_text = trigger_request.text.lower()
                    return any(keyword.lower() in message_text for keyword in str_keywords)
            else:
                # No keywords specified, so don't trigger on general channel messages
                return False

        return should_trigger
    except Exception as e:
        logger.error(f"Error in _should_trigger_workflow: {str(e)}")
        return False


async def _trigger_workflow(
    db: Session,
    agent: SlackAgentModel,
    trigger_request: WorkflowTriggerRequest,
    say: Callable[..., Any],
    client: Optional[WebClient] = None,
):
    """Trigger the workflow and handle the response"""
    try:
        # Prepare the run input
        run_input = {
            "message": trigger_request.text,
            "channel_id": trigger_request.channel_id,
            "user_id": trigger_request.user_id,
            "event_type": trigger_request.event_type,
            "event_data": trigger_request.event_data,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Start the workflow run
        background_tasks = BackgroundTasks()
        run = await start_workflow_run(
            db=db,
            workflow_id=cast(str, agent.workflow_id),
            run_input=run_input,
            background_tasks=background_tasks,
        )

        # Let the user know we're processing their request
        # Use client if available, otherwise fall back to say function
        if client and trigger_request.channel_id:
            try:
                client.chat_postMessage(
                    channel=trigger_request.channel_id,
                    text=f"Processing your request... (Run ID: {run.id})",
                )
            except Exception as e:
                logger.error(f"Error using client to respond: {e}")
                say(text=f"Processing your request... (Run ID: {run.id})")
        else:
            say(text=f"Processing your request... (Run ID: {run.id})")

        logger.info(f"Started workflow run {run.id} for agent {agent.id}")

        # Manually execute background tasks since we're not in a FastAPI endpoint
        logger.info(f"Manually executing background tasks for workflow run {run.id}")
        for task in background_tasks.tasks:
            logger.info(f"Executing task: {str(task)}")
            await task()
        logger.info(f"Background tasks execution completed for workflow run {run.id}")

        # Wait for workflow to complete and return results to Slack
        await _send_workflow_results_to_slack(run.id, trigger_request.channel_id, client, say)

    except Exception as e:
        logger.error(f"Error triggering workflow for agent {agent.id}: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        say(text=f"Sorry, I encountered an error: {str(e)}")


async def _send_workflow_results_to_slack(
    run_id: str,
    channel_id: str,
    client: Optional[WebClient] = None,
    say: Optional[Callable[..., Any]] = None,
    db: Optional[Session] = None,
):
    """Get workflow results and send them back to Slack."""
    own_db_session = db is None

    try:
        # Create a new database session if one wasn't provided
        if own_db_session:
            db = next(get_db())

        # Wait for the workflow to complete (poll status)
        # Poll for up to 2 minutes (24 attempts, 5 seconds apart)
        max_attempts = 24
        attempts = 0
        run_complete = False
        run = None

        while attempts < max_attempts and not run_complete:
            attempts += 1
            # Get the run model from database
            run = db.query(RunModel).filter(RunModel.id == run_id).first()

            if not run:
                logger.error(f"Run {run_id} not found in database")
                break

            # Check if the run has completed or failed
            if run.status in [
                RunStatus.COMPLETED,
                RunStatus.FAILED,
                RunStatus.PAUSED,
                RunStatus.CANCELED,
            ]:
                run_complete = True
                break

            # Wait before polling again
            await asyncio.sleep(5)

        # Prepare the message to send back
        if not run:
            message = f"⚠️ Could not find workflow run {run_id}"
        elif not run_complete:
            message = f"⏱️ Workflow run {run_id} is still in progress (status: {run.status})"
        elif run.status == RunStatus.COMPLETED:
            # Format the output message
            if run.outputs:
                # Find the output node
                output_content = None
                # Typically outputs are stored with node IDs as keys
                for node_id, output in run.outputs.items():
                    # Look for output node or content that has relevant output data
                    if isinstance(output, dict) and (
                        "result" in output or "content" in output or "text" in output
                    ):
                        output_content = (
                            output.get("result") or output.get("content") or output.get("text")
                        )
                        break

                if output_content:
                    message = (
                        f"✅ Workflow completed successfully!\n\n*Output:*\n```{output_content}```"
                    )
                else:
                    # If we can't find a specific output format, just return the full output as JSON
                    message = f"✅ Workflow completed successfully!\n\n*Output:*\n```{json.dumps(run.outputs, indent=2)}```"
            else:
                message = "✅ Workflow completed successfully! (No output data available)"
        elif run.status == RunStatus.FAILED:
            message = "❌ Workflow run failed"
            # Look for error messages in tasks
            error_messages = []
            if run.tasks:
                for task in run.tasks:
                    if task.status == TaskStatus.FAILED and task.error:
                        error_messages.append(f"- Task {task.node_id}: {task.error}")

            if error_messages:
                message += "\n\n*Errors:*\n" + "\n".join(error_messages)
        else:
            message = f"⚠️ Workflow run {run_id} ended with status: {run.status}"

        # Send the message back to Slack
        if client and channel_id:
            try:
                logger.info(f"Sending workflow result to Slack channel {channel_id}")
                client.chat_postMessage(channel=channel_id, text=message)
                logger.info("Successfully sent workflow result to Slack")
            except Exception as e:
                logger.error(f"Error sending workflow results to Slack: {e}")
                if say:
                    say(text=message)
        elif say:
            logger.info("Using say function to send workflow result")
            say(text=message)
        else:
            logger.error("Cannot send workflow results: No Slack client or say function available")

    except Exception as e:
        logger.error(f"Error sending workflow results to Slack: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")

        # Try to send error message
        error_msg = f"Error retrieving workflow results: {str(e)}"
        if client and channel_id:
            try:
                client.chat_postMessage(channel=channel_id, text=error_msg)
            except Exception:
                if say:
                    say(text=error_msg)
        elif say:
            say(text=error_msg)
    finally:
        # Clean up if we created our own session
        if own_db_session and db:
            db.close()


# Set the callback for the socket mode client - use the sync version
socket_mode_client.set_workflow_trigger_callback(handle_socket_mode_event_sync)  # type: ignore


@router.get("/config/status")
async def get_slack_config_status():
    """Check if Slack configuration is complete and return the status"""
    # Check if the required environment variables are set
    bot_token = os.getenv("SLACK_BOT_TOKEN", "")
    signing_secret = os.getenv("SLACK_SIGNING_SECRET", "")

    # Return the configuration status
    return {
        "configured": bool(bot_token) and bool(signing_secret),
        "missing_keys": [
            key
            for key, value in {
                "SLACK_BOT_TOKEN": bot_token,
                "SLACK_SIGNING_SECRET": signing_secret,
            }.items()
            if not value
        ],
    }


@router.get("/required-keys")
async def get_slack_required_keys():
    """Get information about the required Slack API keys and their current status"""
    # Get current values (masked for security)
    bot_token = os.getenv("SLACK_BOT_TOKEN", "")

    # Function to mask key values for display
    def mask_value(value: str) -> str:
        if not value:
            return ""
        if len(value) <= 8:
            return "*" * len(value)
        return value[:4] + "*" * (len(value) - 8) + value[-4:]

    # Create a list of required keys with detailed information
    keys_info = [
        {
            "name": "SLACK_BOT_TOKEN",
            "description": "Bot Token from your Slack App, starting with 'xoxb-'",
            "configured": bool(bot_token),
            "masked_value": mask_value(bot_token),
            "required": True,
            "purpose": "Used to send messages and interact with Slack API",
            "help_url": "https://api.slack.com/authentication/token-types",
        },
    ]

    # Check if all required keys are configured
    all_required_configured = all(key["configured"] for key in keys_info if key["required"])

    return {
        "configured": all_required_configured,
        "keys": keys_info,
    }


@router.get("/agents", response_model=List[SlackAgentResponse])
async def get_agents(db: Session = Depends(get_db)):
    """Get all configured Slack agents"""
    agents = db.query(SlackAgentModel).all()
    agent_responses = []

    for agent in agents:
        # Convert the agent to a SlackAgentResponse with proper type handling
        agent_response = _agent_to_response_model(agent)
        agent_responses.append(agent_response)

    return agent_responses


# Helper function to convert a SlackAgentModel to a SlackAgentResponse
def _agent_to_response_model(agent: SlackAgentModel) -> SlackAgentResponse:
    """Convert a SlackAgentModel to a SlackAgentResponse with proper type handling."""
    # Safe conversion for SQLAlchemy Column types
    # Using explicit conversion and nullchecks for SQLAlchemy Column types
    try:
        # The int() cast may fail if SQLAlchemy Column is not properly initialized
        agent_id = int(agent.id) if agent.id is not None else 0  # type: ignore
    except (TypeError, ValueError):
        agent_id = 0

    # Build dictionary with careful conversion for SQLAlchemy types
    agent_dict = {
        "id": agent_id,
        "name": str(agent.name) if agent.name is not None else "",
        "slack_team_id": str(agent.slack_team_id) if agent.slack_team_id is not None else None,
        "slack_team_name": str(agent.slack_team_name)
        if agent.slack_team_name is not None
        else None,
        "slack_channel_id": str(agent.slack_channel_id)
        if agent.slack_channel_id is not None
        else None,
        "slack_channel_name": str(agent.slack_channel_name)
        if agent.slack_channel_name is not None
        else None,
        "is_active": bool(agent.is_active) if agent.is_active is not None else True,
        "workflow_id": str(agent.workflow_id) if agent.workflow_id is not None else None,
        "trigger_on_mention": bool(agent.trigger_on_mention)
        if agent.trigger_on_mention is not None
        else True,
        "trigger_on_direct_message": bool(agent.trigger_on_direct_message)
        if agent.trigger_on_direct_message is not None
        else True,
        "trigger_on_channel_message": bool(agent.trigger_on_channel_message)
        if agent.trigger_on_channel_message is not None
        else False,
        "trigger_keywords": [str(k) for k in agent.trigger_keywords]
        if agent.trigger_keywords
        else None,  # type: ignore
        "trigger_enabled": bool(agent.trigger_enabled)
        if agent.trigger_enabled is not None
        else True,
        "has_bot_token": bool(agent.has_bot_token) if agent.has_bot_token is not None else False,
        "has_user_token": bool(agent.has_user_token) if agent.has_user_token is not None else False,
        "has_app_token": bool(agent.has_app_token) if agent.has_app_token is not None else False,
        "last_token_update": str(agent.last_token_update)
        if agent.last_token_update is not None
        else None,
        "spur_type": str(getattr(agent, "spur_type", "workflow") or "workflow"),
        "created_at": str(getattr(agent, "created_at", "") or ""),
    }
    return SlackAgentResponse.model_validate(agent_dict)


@router.post("/agents", response_model=SlackAgentResponse)
async def create_agent(agent_create: SlackAgentCreate, db: Session = Depends(get_db)):
    """Create a new Slack agent configuration"""
    # Ensure workflow_id is provided
    if not agent_create.workflow_id:
        raise HTTPException(
            status_code=400,
            detail="workflow_id is required - every agent must be associated with a workflow",
        )

    # Create a new agent from the agent_create fields
    new_agent = SlackAgentModel(
        name=agent_create.name,
        slack_team_id=agent_create.slack_team_id,
        slack_team_name=agent_create.slack_team_name,
        slack_channel_id=agent_create.slack_channel_id,
        slack_channel_name=agent_create.slack_channel_name,
        is_active=bool(agent_create.is_active),
        workflow_id=agent_create.workflow_id,
        trigger_on_mention=bool(agent_create.trigger_on_mention),
        trigger_on_direct_message=bool(agent_create.trigger_on_direct_message),
        trigger_on_channel_message=bool(agent_create.trigger_on_channel_message),
        trigger_keywords=agent_create.trigger_keywords,
        trigger_enabled=bool(agent_create.trigger_enabled),
        has_bot_token=bool(agent_create.has_bot_token),
        has_user_token=bool(agent_create.has_user_token),
        has_app_token=bool(agent_create.has_app_token),
        last_token_update=agent_create.last_token_update,
        spur_type=agent_create.spur_type or "workflow",
    )

    db.add(new_agent)
    db.commit()
    db.refresh(new_agent)

    # Convert the agent to a Pydantic model
    return _agent_to_response_model(new_agent)


@router.get("/agents/{agent_id}", response_model=SlackAgentResponse)
async def get_agent(agent_id: int, db: Session = Depends(get_db)):
    """Get a Slack agent configuration"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Convert the agent to a Pydantic model
    return _agent_to_response_model(agent)


@router.post("/agents/{agent_id}/send-message", response_model=SlackMessageResponse)
async def send_agent_message(agent_id: int, message: SlackMessage, db: Session = Depends(get_db)):
    """Send a message to a channel using the Slack agent"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Create a client using the agent's token
    token = None

    # If agent has a bot token, retrieve it
    has_bot_token = bool(agent.has_bot_token)
    if has_bot_token:
        logger.info(f"Retrieving bot token for agent {agent_id}")
        token_store = get_token_store()
        token = token_store.get_token(agent_id, "bot_token")

    if not token:
        raise HTTPException(status_code=400, detail="This agent has no bot token configured")

    # Send the message to Slack
    try:
        client = WebClient(token=token)
        logger.info(f"Sending message to channel '{message.channel}'")

        # Call Slack API - ignore type issues with chat_postMessage
        slack_response = client.chat_postMessage(  # type: ignore
            channel=message.channel,
            text=message.text,
        )

        # Extract data from the response
        response_data = {
            "ts": slack_response.get("ts", ""),
            "channel": slack_response.get("channel", ""),
            "message": "Message sent successfully",
            "success": True,
        }

        logger.info(f"Message sent successfully: {slack_response.get('ok', False)}")
        return response_data
    except SlackApiError as e:
        logger.error(f"Error sending message to Slack: {str(e)}")
        # If there was an error, raise an HTTPException
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"Error sending message to Slack: {str(e)}",
                "success": False,
            },
        )


@router.post("/send-message", response_model=SlackMessageResponse)
async def send_message(
    channel: str, text: str, agent_id: Optional[int] = None, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Send a message to a Slack channel."""
    logger.info(f"Attempting to send message to channel '{channel}' with agent_id: {agent_id}")

    # Initialize WebClient with the bot token
    token = None

    # If agent_id is provided, try to get the agent-specific token
    if agent_id is not None:
        # Try to get the agent
        logger.info(f"Searching for agent with ID: {agent_id}")
        agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()

        if agent:
            has_bot_token = bool(agent.has_bot_token)
            logger.info(f"Found agent '{agent.name}' with has_bot_token={has_bot_token}")

            # If agent has a bot token, retrieve it
            if has_bot_token:
                logger.info(f"Retrieving bot token for agent {agent_id}")
                token_store = get_token_store()
                token = token_store.get_token(agent_id, "bot_token")
                logger.info(f"Token retrieved: {'Yes' if token else 'No'}")
        else:
            logger.error(f"Agent with ID {agent_id} not found")

    # If no agent-specific token, try to use the default token from environment
    if not token:
        logger.info("No agent-specific token found, using environment variables")
        token = os.getenv("SLACK_BOT_TOKEN")

    if not token:
        logger.error("No Slack bot token configured")
        raise HTTPException(
            status_code=500,
            detail={
                "message": "No Slack bot token configured",
                "success": False,
            },
        )

    try:
        client = WebClient(token=token)
        logger.info(f"Sending message to channel '{channel}'")

        # Call Slack API - ignore type issues with chat_postMessage
        slack_response = client.chat_postMessage(  # type: ignore
            channel=channel,
            text=text,
        )

        # Extract data from the response
        response_data = {
            "ts": slack_response.get("ts", ""),
            "channel": slack_response.get("channel", ""),
            "message": "Message sent successfully",
            "success": True,
        }

        logger.info(f"Message sent successfully: {slack_response.get('ok', False)}")
        return response_data
    except SlackApiError as e:
        logger.error(f"Error sending message to Slack: {str(e)}")
        # If there was an error, raise an HTTPException
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"Error sending message to Slack: {str(e)}",
                "success": False,
            },
        )


@router.post("/test-message", response_model=SlackMessageResponse)
async def test_message(
    channel: str,
    text: str = "Hello from PySpur! This is a test message.",
    agent_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Test sending a message to a Slack channel"""
    try:
        # Attempt to send the test message using the Slack client
        response = await send_message(channel=channel, text=text, agent_id=agent_id, db=db)
        return response
    except Exception as e:
        logger.error(f"Error sending test message: {e}")
        return {"success": False, "message": f"Error sending test message: {e}"}


@router.put("/agents/{agent_id}/workflow", response_model=SlackAgentResponse)
async def associate_workflow(
    agent_id: int, association: WorkflowAssociation, db: Session = Depends(get_db)
):
    """Associate a workflow with a Slack agent"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update agent using SQLAlchemy ORM
    agent.workflow_id = association.workflow_id
    db.commit()
    db.refresh(agent)

    # Convert the agent to a Pydantic model
    return _agent_to_response_model(agent)


@router.put("/agents/{agent_id}/trigger-config", response_model=SlackAgentResponse)
async def update_trigger_config(
    agent_id: int, config: SlackTriggerConfig, db: Session = Depends(get_db)
):
    """Update the trigger configuration for a Slack agent"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update agent using setattr to avoid Column typing issues
    agent.trigger_on_mention = config.trigger_on_mention
    agent.trigger_on_direct_message = config.trigger_on_direct_message
    agent.trigger_on_channel_message = config.trigger_on_channel_message
    agent.trigger_keywords = config.trigger_keywords
    agent.trigger_enabled = config.trigger_enabled

    db.commit()
    db.refresh(agent)

    # Convert the agent to a Pydantic model
    return _agent_to_response_model(agent)


@router.put("/agents/{agent_id}", response_model=SlackAgentResponse)
async def update_agent(
    agent_id: int, agent_update: SlackAgentUpdate, db: Session = Depends(get_db)
):
    """Update a Slack agent configuration"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update agent from the agent_update fields
    update_data = agent_update.model_dump(exclude_unset=True)

    # Ensure boolean fields are properly converted
    for field in update_data:
        setattr(agent, field, update_data[field])

    db.commit()
    db.refresh(agent)

    # Convert the agent to a Pydantic model
    return _agent_to_response_model(agent)


# Helper function to start a workflow run using the existing workflow execution system
async def start_workflow_run(
    db: Session, workflow_id: str, run_input: Dict[str, Any], background_tasks: BackgroundTasks
) -> RunModel:
    """Start a workflow run with the given input data using the standard workflow execution system."""
    # First, check if the workflow exists
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Get the input node ID from the workflow
    workflow_definition = workflow.definition
    input_node = next(
        (node for node in workflow_definition["nodes"] if node["node_type"] == "InputNode"), None
    )

    if not input_node:
        raise HTTPException(status_code=400, detail="Workflow has no input node")

    # Create the request payload with the input data
    initial_inputs = {input_node["id"]: run_input}
    start_run_request = StartRunRequestSchema(initial_inputs=initial_inputs)

    # Use the standard workflow execution system to run the workflow
    run_response = await run_workflow_non_blocking(
        workflow_id=workflow_id,
        start_run_request=start_run_request,
        background_tasks=background_tasks,
        db=db,
        run_type="slack_triggered",
    )

    # Extract the RunModel from the response
    return db.query(RunModel).filter(RunModel.id == run_response.id).first()


@router.post("/trigger-workflow", response_model=WorkflowTriggersResponse)
async def trigger_workflow(
    request: WorkflowTriggerRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Trigger workflows based on a Slack event"""
    result = WorkflowTriggersResponse(triggered_workflows=[])

    # Find agents that match the team ID
    agents = (
        db.query(SlackAgentModel)
        .filter(
            SlackAgentModel.slack_team_id == request.team_id,
            SlackAgentModel.is_active.is_(True),
            SlackAgentModel.trigger_enabled.is_(True),
            SlackAgentModel.workflow_id.isnot(None),
        )
        .all()
    )

    if not agents:
        return result

    # Process each agent to see if it should be triggered
    for agent in agents:
        # Cast SQLAlchemy Column types to Python types for the constructor
        agent_id = cast(int, agent.id)
        workflow_id = cast(str, agent.workflow_id)

        trigger_result = WorkflowTriggerResult(
            agent_id=agent_id,
            workflow_id=workflow_id,
            status="skipped",
        )

        # Check if this agent should be triggered based on the event type
        should_trigger = False

        # Check mention trigger - convert SQLAlchemy Column to bool for comparison
        if bool(agent.trigger_on_mention) and request.event_type == "app_mention":
            should_trigger = True

        # Check direct message trigger
        elif (
            bool(agent.trigger_on_direct_message)
            and request.event_type == "message"
            and request.event_data.get("channel_type") == "im"
        ):
            should_trigger = True

        # Check channel message trigger
        elif (
            bool(agent.trigger_on_channel_message)
            and request.event_type == "message"
            and request.event_data.get("channel_type") in ["channel", "group"]
        ):
            # If keywords are specified, check if any are in the message
            keywords = getattr(agent, "trigger_keywords", None)
            if keywords and isinstance(keywords, list):
                # Make sure keywords is a list of strings before using len
                str_keywords = [str(k) for k in keywords if k is not None]
                if len(str_keywords) > 0:
                    message_text = request.text.lower()
                    for keyword in str_keywords:
                        if keyword.lower() in message_text:
                            should_trigger = True
                            break
            else:
                should_trigger = True

        if should_trigger:
            try:
                # Prepare the run input
                run_input = {
                    "message": request.text,
                    "channel_id": request.channel_id,
                    "user_id": request.user_id,
                    "event_type": request.event_type,
                    "event_data": request.event_data,
                    "timestamp": datetime.now(UTC).isoformat(),  # Use timezone-aware datetime
                }

                # Start the workflow run using the standard workflow execution system
                run = await start_workflow_run(
                    db=db,
                    workflow_id=cast(str, agent.workflow_id),
                    run_input=run_input,
                    background_tasks=background_tasks,
                )

                trigger_result.status = "triggered"
                trigger_result.run_id = run.id

            except Exception as e:
                trigger_result.status = "error"
                trigger_result.error = str(e)

        result.triggered_workflows.append(trigger_result)

    return result


@router.post("/events", status_code=200)
async def slack_events(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Handle Slack events from the Events API"""
    data = await request.json()

    # Handle Slack URL verification challenge
    if data.get("type") == "url_verification":
        return {"challenge": data.get("challenge")}

    # Process other events
    event = data.get("event", {})
    event_type = event.get("type")

    if not event_type:
        return {"ok": True}

    # Extract relevant data
    team_id = data.get("team_id")
    user_id = event.get("user")
    channel_id = event.get("channel")
    text = event.get("text", "")

    # Skip bot messages to avoid loops
    if event.get("bot_id") or user_id == "USLACKBOT":
        return {"ok": True}

    # Create a trigger request
    trigger_request = WorkflowTriggerRequest(
        text=text,
        channel_id=channel_id,
        user_id=user_id,
        team_id=team_id,
        event_type=event_type,
        event_data=event,
    )

    # Process asynchronously to respond to Slack quickly
    background_tasks.add_task(trigger_workflow, trigger_request, background_tasks, db)

    return {"ok": True}


@router.post("/agents/{agent_id}/tokens/{token_type}", response_model=AgentTokenResponse)
async def set_agent_token(
    agent_id: int, token_type: str, token_request: AgentTokenRequest, db: Session = Depends(get_db)
):
    # Override token_request.token_type with the type from the URL
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    token_store = get_token_store()
    token_store.store_token(agent_id, token_type, token_request.token)

    # Update agent token flag
    if token_type == "bot_token":
        agent.has_bot_token = True

        # Try to get team information when setting a bot token
        try:
            client = WebClient(token=token_request.token)
            response = client.auth_test()
            if response["ok"]:
                team_id = response.get("team_id")
                team_name = response.get("team")
                if team_id:
                    agent.slack_team_id = team_id
                    agent.slack_team_name = team_name
                    logger.info(
                        f"Updated agent {agent_id} with team information: {team_name} ({team_id})"
                    )
        except Exception as e:
            logger.warning(f"Failed to retrieve team information: {str(e)}")
            # Don't fail the token setting if we can't get team info
            pass

    elif token_type == "user_token":
        agent.has_user_token = True
    elif token_type == "app_token":
        agent.has_app_token = True

    current_timestamp = datetime.now(UTC).isoformat()
    agent.last_token_update = current_timestamp
    db.commit()
    db.refresh(agent)

    # Mask the token for the response
    masked_token = mask_token(token_request.token)
    return AgentTokenResponse(
        agent_id=agent_id,
        token_type=token_type,
        masked_token=masked_token,
        updated_at=current_timestamp,
    )


# Helper function to mask tokens for the API response
def mask_token(token: str) -> str:
    """Create a masked version of the token for display."""
    if len(token) <= 8:
        return "*" * len(token)
    return token[:4] + "*" * (len(token) - 8) + token[-4:]


@router.get("/agents/{agent_id}/tokens/{token_type}", response_model=AgentTokenResponse)
async def get_agent_token(agent_id: int, token_type: str, db: Session = Depends(get_db)):
    """Get a masked token for a Slack agent"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    if token_type not in ["bot_token", "user_token", "app_token"]:
        raise HTTPException(status_code=400, detail="Invalid token type")

    token_store = get_token_store()

    # Get the token
    token = token_store.get_token(agent_id, token_type)
    if not token:
        raise HTTPException(status_code=404, detail=f"No {token_type} found for this agent")

    # Mask the token for the response
    masked_token = mask_token(token)

    # Get the last update timestamp
    last_token_update = (
        str(agent.last_token_update) if agent.last_token_update is not None else None
    )

    return AgentTokenResponse(
        agent_id=agent_id,
        token_type=token_type,
        masked_token=masked_token,
        updated_at=last_token_update,
    )


@router.delete("/agents/{agent_id}/tokens/{token_type}", status_code=204)
async def delete_agent_token(agent_id: int, token_type: str, db: Session = Depends(get_db)):
    """Delete a token for a Slack agent"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    if token_type not in ["bot_token", "user_token", "app_token"]:
        raise HTTPException(status_code=400, detail="Invalid token type")

    token_store = get_token_store()

    # Delete the token
    token_store.delete_token(agent_id, token_type)

    # Update agent token flag
    if token_type == "bot_token":
        agent.has_bot_token = False
    elif token_type == "user_token":
        agent.has_user_token = False
    elif token_type == "app_token":
        agent.has_app_token = False

    current_timestamp = datetime.now(UTC).isoformat()
    agent.last_token_update = current_timestamp
    db.commit()

    return None


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    """Delete a Slack agent by ID"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Delete any associated tokens
    token_store = get_token_store()
    token_store.delete_token(agent_id, "bot_token")
    token_store.delete_token(agent_id, "user_token")
    token_store.delete_token(agent_id, "app_token")

    # Delete the agent
    db.delete(agent)
    db.commit()

    return None


@router.post("/set-token", response_model=dict)
async def set_slack_token(request: Request):
    """Directly set the Slack bot token"""
    try:
        data = await request.json()
        token = data.get("token")

        if not token:
            raise HTTPException(status_code=400, detail="Token is required")

        # Store the token
        try:
            key_management.set_env_variable("SLACK_BOT_TOKEN", token)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to store token: {str(e)}")

        return {"success": True, "message": "Slack token has been set successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting Slack token: {str(e)}")


@router.post("/agents/{agent_id}/socket-mode/start", response_model=SlackSocketModeResponse)
async def start_socket_mode(agent_id: int, db: Session = Depends(get_db)):
    """Start Socket Mode for a Slack agent"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not getattr(agent, "has_bot_token", False):
        raise HTTPException(status_code=400, detail="Agent doesn't have a bot token")

    # Check if the agent has an app token or if there's one in the environment
    if not getattr(agent, "has_app_token", False) and not os.getenv("SLACK_APP_TOKEN"):
        raise HTTPException(
            status_code=400,
            detail="Socket Mode requires an app token. Please configure an app token for this agent or set the SLACK_APP_TOKEN environment variable.",
        )

    # Check if the signing secret is configured
    signing_secret = os.getenv("SLACK_SIGNING_SECRET", "")
    if not signing_secret:
        raise HTTPException(
            status_code=400, detail="SLACK_SIGNING_SECRET environment variable not configured"
        )

    # Check if socket mode is disabled in the main process
    socket_mode_disabled = os.environ.get("SOCKET_MODE_DISABLED", "").lower() in (
        "true",
        "1",
        "yes",
    )

    if socket_mode_disabled:
        # Even when socket mode is managed by workers, update the agent's socket_mode_enabled field
        agent.socket_mode_enabled = True
        db.commit()

        return SlackSocketModeResponse(
            agent_id=agent_id,
            socket_mode_active=True,
            message="Socket Mode request accepted. Socket Mode is managed by dedicated workers.",
        )

    # Start socket mode
    success = socket_mode_client.start_socket_mode(agent_id)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to start Socket Mode")

    # Store socket mode status in the database
    agent.socket_mode_enabled = True
    db.commit()

    return SlackSocketModeResponse(
        agent_id=agent_id, socket_mode_active=True, message="Socket Mode started successfully"
    )


def _get_container_names(
    container_name: str = None, container_prefix: str = None, client=None
) -> list:
    """Get container names to restart based on name or prefix.

    Args:
        container_name: Specific container name to stop
        container_prefix: Prefix to match multiple containers
        client: Docker client (if available)

    Returns:
        list: List of container names to restart

    """
    containers = []

    # Try to find by exact name
    if container_name:
        if client:
            try:
                containers.append(client.containers.get(container_name))
                logger.info(f"Found specific container: {container_name}")
            except Exception:
                logger.warning(f"Container not found: {container_name}")
        else:
            containers.append(container_name)

    # Try to find by prefix
    if container_prefix and client:
        for container in client.containers.list():
            if container.name.startswith(container_prefix):
                if container not in containers:
                    containers.append(container)
                    logger.info(f"Found container by prefix: {container.name}")

    return containers


def _restart_with_cli(container_names: list, container_prefix: str = None) -> bool:
    """Restart containers using Docker CLI.

    Args:
        container_names: List of container names to restart
        container_prefix: Optional prefix to find additional containers

    Returns:
        bool: True if at least one container was restarted

    """
    success = False
    try:
        import subprocess

        # Get container names if we only have prefix
        if not container_names and container_prefix:
            cmd = [
                "docker",
                "ps",
                "--filter",
                f"name={container_prefix}",
                "--format",
                "{{.Names}}",
            ]
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            container_names = [name for name in result.stdout.strip().split("\n") if name]
            logger.info(f"Found containers via CLI: {container_names}")

        # Restart each container
        for name in container_names:
            try:
                logger.info(f"Restarting container via CLI: {name}")
                subprocess.run(
                    ["docker", "restart", name], check=True, capture_output=True, text=True
                )
                success = True
            except Exception as e:
                logger.error(f"Failed to restart container {name} via CLI: {e}")
    except Exception as e:
        logger.error(f"Failed to use Docker CLI: {e}")

    return success


def stop_socket_worker_containers(container_name: str = None, container_prefix: str = None) -> bool:
    """Stop or restart socket worker containers.

    Args:
        container_name: Specific container name to stop
        container_prefix: Prefix to match multiple containers

    Returns:
        bool: True if at least one container was successfully managed

    """
    # Use environment variables if no parameters provided
    if not container_name and not container_prefix:
        container_name = os.environ.get("SOCKET_WORKER_CONTAINER", "pyspur-slack-socket-worker-1")
        container_prefix = os.environ.get("SOCKET_WORKER_PREFIX", "pyspur-slack-socket-worker")

    logger.info(f"Managing socket worker containers: {container_name} or prefix {container_prefix}")
    success = False

    # Try the Python Docker client first
    try:
        import docker

        client = docker.from_env()
        client.ping()  # Test connection

        # Get containers to manage
        containers = _get_container_names(container_name, container_prefix, client)

        # Restart all found containers
        for container in containers:
            try:
                container.restart()
                success = True
                logger.info(f"Restarted container: {container.name}")
            except Exception as e:
                logger.error(f"Failed to restart container {container.name}: {e}")

    except Exception as e:
        logger.warning(f"Docker client failed, falling back to CLI: {e}")
        # Fallback to Docker CLI
        container_names = [container_name] if container_name else []
        success = _restart_with_cli(container_names, container_prefix) or success

    return success


@router.post("/agents/{agent_id}/socket-mode/stop", response_model=SlackSocketModeResponse)
async def stop_socket_mode(agent_id: int, db: Session = Depends(get_db)):
    """Stop Socket Mode for a Slack agent"""
    try:
        # Get agent
        agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        # Check if socket mode is already disabled
        if not agent.socket_mode_enabled:
            return SlackSocketModeResponse(
                agent_id=agent_id,
                socket_mode_active=False,
                message="Socket Mode already disabled",
            )

        # Disable socket mode for the agent
        agent.socket_mode_enabled = False
        db.commit()

        # Set default response message
        message = "Socket Mode stopped."

        # Force restart the socket worker containers to kill all connections
        try:
            container_name = os.environ.get(
                "SOCKET_WORKER_CONTAINER", "pyspur-slack-socket-worker-1"
            )
            container_prefix = os.environ.get("SOCKET_WORKER_PREFIX", "pyspur-slack-socket-worker")

            logger.info(
                f"Restarting socket worker containers: {container_name} or {container_prefix}"
            )

            success = stop_socket_worker_containers(container_name, container_prefix)

            if success:
                message += " Worker containers restarted to kill all connections."
            else:
                message += " Warning: Failed to restart worker containers."

        except Exception as e:
            logger.error(f"Failed to restart socket worker containers: {e}")
            message += " Error: Could not restart worker containers."

        return SlackSocketModeResponse(
            agent_id=agent_id,
            socket_mode_active=False,
            message=message,
        )
    except Exception as e:
        logger.error(f"Error stopping socket mode: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop Socket Mode: {str(e)}")


@router.get("/agents/{agent_id}/socket-mode/status", response_model=SlackSocketModeResponse)
async def get_socket_mode_status(agent_id: int, db: Session = Depends(get_db)):
    """Get Socket Mode status for a Slack agent"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Check if socket mode is disabled in the main process
    socket_mode_disabled = os.environ.get("SOCKET_MODE_DISABLED", "").lower() in (
        "true",
        "1",
        "yes",
    )

    if socket_mode_disabled:
        # In this case, we need to check with the database if there should be a worker
        # handling this agent
        agent_is_active = (
            bool(agent.is_active)
            and bool(agent.trigger_enabled)
            and bool(agent.has_bot_token)
            and agent.workflow_id is not None
        )

        # Also check the agent's socket_mode_enabled field
        socket_mode_enabled = getattr(agent, "socket_mode_enabled", False)

        return SlackSocketModeResponse(
            agent_id=agent_id,
            socket_mode_active=agent_is_active and socket_mode_enabled,
            message=f"Socket Mode is {'active' if (agent_is_active and socket_mode_enabled) else 'inactive'} (managed by dedicated workers)",
        )

    is_active = socket_mode_client.is_running(agent_id)

    return SlackSocketModeResponse(
        agent_id=agent_id,
        socket_mode_active=is_active,
        message=f"Socket Mode is {'active' if is_active else 'inactive'}",
    )


@router.get("/agents/{agent_id}/debug-tokens")
async def debug_agent_tokens(agent_id: int, db: Session = Depends(get_db)):
    """Debug endpoint to check token storage for an agent"""
    agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    token_store = get_token_store()

    # Check each token type
    token_info = {
        "agent_id": agent_id,
        "agent_name": agent.name,
        "has_bot_token_flag": agent.has_bot_token,
        "has_user_token_flag": agent.has_user_token,
        "has_app_token_flag": agent.has_app_token,
        "last_token_update": agent.last_token_update,
    }

    # Try to get each token and check if it exists
    try:
        bot_token = token_store.get_token(agent_id, "bot_token")
        token_info["bot_token_exists"] = bool(bot_token)
        if bot_token:
            token_info["bot_token_starts_with"] = bot_token[:5] + "..."
    except Exception as e:
        token_info["bot_token_error"] = str(e)

    try:
        user_token = token_store.get_token(agent_id, "user_token")
        token_info["user_token_exists"] = bool(user_token)
        if user_token:
            token_info["user_token_starts_with"] = user_token[:5] + "..."
    except Exception as e:
        token_info["user_token_error"] = str(e)

    try:
        app_token = token_store.get_token(agent_id, "app_token")
        token_info["app_token_exists"] = bool(app_token)
        if app_token:
            token_info["app_token_starts_with"] = app_token[:5] + "..."
    except Exception as e:
        token_info["app_token_error"] = str(e)

    return token_info


@router.post("/agents/{agent_id}/test-connection", response_model=dict)
async def test_connection(agent_id: int, db: Session = Depends(get_db)):
    """Test if the Slack connection for an agent works properly"""
    try:
        agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
        if agent is None:
            raise HTTPException(status_code=404, detail="Agent not found")

        if not agent.has_bot_token:
            return {"success": False, "message": "Agent doesn't have a bot token configured"}

        # Get the bot token from the token store
        token_store = get_token_store()
        bot_token = token_store.get_token(agent_id, "bot_token")

        if not bot_token:
            return {"success": False, "message": "Could not retrieve bot token"}

        # Test the token by calling auth.test
        from slack_sdk import WebClient
        from slack_sdk.errors import SlackApiError

        client = WebClient(token=bot_token)
        try:
            response = client.auth_test()
            if response["ok"]:
                team = response.get("team", "Unknown workspace")
                team_id = response.get("team_id")
                user = response.get("user", "Unknown bot")

                # Update the agent's team information
                if team_id:
                    agent.slack_team_id = team_id
                    agent.slack_team_name = team
                    db.commit()
                    logger.info(
                        f"Updated agent {agent_id} with team information: {team} ({team_id})"
                    )

                return {
                    "success": True,
                    "message": f"Successfully connected to {team} as {user}",
                    "team_id": team_id,
                    "bot_id": response.get("bot_id"),
                    "user_id": response.get("user_id"),
                }
            else:
                return {
                    "success": False,
                    "message": f"API call succeeded but returned not OK: {response.get('error', 'Unknown error')}",
                }
        except SlackApiError as e:
            error_message = e.response["error"] if "error" in e.response else str(e)
            return {"success": False, "message": f"API Error: {error_message}"}
    except Exception as e:
        logger.error(f"Error testing Slack connection: {e}")
        return {"success": False, "message": f"Error: {str(e)}", "error": str(e)}

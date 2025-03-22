from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SlackAgentBase(BaseModel):
    name: str
    slack_team_id: Optional[str] = None  # Will be populated upon Slack connection
    slack_team_name: Optional[str] = None  # Will be populated upon Slack connection
    slack_channel_id: Optional[str] = None
    slack_channel_name: Optional[str] = None
    is_active: bool = True
    spur_type: str = "workflow"  # "spur-web", "spur-chat", etc.

    def model_dump(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        return super().model_dump(*args, **kwargs)


class SlackAgentCreate(SlackAgentBase):
    """Request schema for creating a Slack agent.
    Note: slack_team_id and slack_team_name will be set automatically based on the
    currently configured Slack token if not provided.
    """

    workflow_id: str  # Workflow to associate with this agent
    trigger_on_mention: bool = True
    trigger_on_direct_message: bool = True
    trigger_on_channel_message: bool = False
    trigger_keywords: Optional[List[str]] = None
    trigger_enabled: bool = True
    has_bot_token: bool = False
    has_user_token: bool = False
    has_app_token: bool = False
    last_token_update: Optional[str] = None


class SlackAgentUpdate(BaseModel):
    """Request schema for updating a Slack agent."""

    name: Optional[str] = None
    slack_team_id: Optional[str] = None
    slack_team_name: Optional[str] = None
    slack_channel_id: Optional[str] = None
    slack_channel_name: Optional[str] = None
    is_active: Optional[bool] = None
    workflow_id: Optional[str] = None
    trigger_on_mention: Optional[bool] = None
    trigger_on_direct_message: Optional[bool] = None
    trigger_on_channel_message: Optional[bool] = None
    trigger_keywords: Optional[List[str]] = None
    trigger_enabled: Optional[bool] = None
    has_bot_token: Optional[bool] = None
    has_user_token: Optional[bool] = None
    has_app_token: Optional[bool] = None
    spur_type: Optional[str] = None

    def model_dump(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        return super().model_dump(*args, **kwargs)


class SlackAgentResponse(SlackAgentBase):
    """Response schema for Slack agent information."""

    id: int
    workflow_id: Optional[str] = None
    trigger_on_mention: bool
    trigger_on_direct_message: bool
    trigger_on_channel_message: bool
    trigger_keywords: Optional[List[str]] = None
    trigger_enabled: bool
    has_bot_token: bool = False
    has_user_token: bool = False
    has_app_token: bool = False
    last_token_update: Optional[str] = None

    model_config = {"from_attributes": True}


class SlackDirectTokenConfig(BaseModel):
    """Request schema for configuring Slack with a direct token."""

    bot_token: str
    description: Optional[str] = "Manually configured Slack bot token"


class SlackMessage(BaseModel):
    """Schema for Slack messages."""

    channel: str
    text: str


class WorkflowAssociation(BaseModel):
    """Schema for associating a workflow with a Slack agent."""

    workflow_id: str


class SlackTriggerConfig(BaseModel):
    """Configuration schema for Slack triggers."""

    trigger_on_mention: bool
    trigger_on_direct_message: bool
    trigger_on_channel_message: bool
    trigger_keywords: List[str]
    trigger_enabled: bool


class WorkflowTriggerRequest(BaseModel):
    """Request schema for triggering a workflow from Slack."""

    text: str
    channel_id: str
    user_id: str
    team_id: str
    event_type: str
    event_data: Dict[str, Any]


class SlackOAuthResponse(BaseModel):
    """Response schema for Slack OAuth callback."""

    success: bool
    message: str
    team_name: Optional[str] = None


class SlackMessageResponse(BaseModel):
    """Response schema for sending a message to Slack."""

    success: bool
    message: str
    ts: Optional[str] = None


class WorkflowTriggerResult(BaseModel):
    """Single result for a triggered workflow."""

    agent_id: int
    workflow_id: str
    status: str  # "triggered", "skipped", "error"
    run_id: Optional[str] = None
    error: Optional[str] = None


class WorkflowTriggersResponse(BaseModel):
    """Response schema for triggering workflows from Slack."""

    triggered_workflows: List[WorkflowTriggerResult]


class TemplateWorkflowResponse(BaseModel):
    """Response schema for creating a template Slack workflow."""

    id: str
    name: str
    description: str
    message: str


# New schemas for agent token management
class AgentTokenRequest(BaseModel):
    """Request schema for token management of Slack agents.
    Supports bot_token, user_token, and app_token types.
    The app_token is required for Socket Mode connections.
    """

    token: str
    token_type: Optional[str] = Field(
        default=None, description="Optional. Token type provided via URL."
    )


class AgentTokenResponse(BaseModel):
    """Response schema for token management operations.
    Supports bot_token, user_token, and app_token types.
    """

    agent_id: int
    token_type: str
    masked_token: str
    updated_at: Optional[str] = None


class SlackSocketModeResponse(BaseModel):
    """Response schema for Socket Mode operations.

    Socket Mode requires both a bot token and an app token to function.
    It enables real-time message handling without exposing a public HTTP endpoint.
    """

    agent_id: int
    socket_mode_active: bool
    message: str


class SlackSocketModeConfig(BaseModel):
    """Configuration schema for Socket Mode settings.

    Socket Mode is a Slack feature that allows your app to receive events through a WebSocket connection
    instead of using HTTP endpoints, which is useful for local development or environments
    behind firewalls. It requires both a bot token and an app-level token.
    """

    enabled: bool = True
    app_token: Optional[str] = None
    use_global_app_token: bool = False  # Whether to use the global SLACK_APP_TOKEN env variable

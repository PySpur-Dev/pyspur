import json
from enum import Enum
from typing import Any, Type

from jinja2 import Template
from pydantic import BaseModel, Field

from ....integrations.slack.client import SlackClient
from ...base import Tool


class ModeEnum(str, Enum):
    BOT = "bot"
    USER = "user"


class SlackNotifyNodeOutput(BaseModel):
    """Output for the SlackNotify node"""

    status: str = Field(
        ...,
        description="Error message if the message was not sent successfully.",
    )


class SlackNotifyNode(Tool):
    """Node for sending messages to Slack channels."""

    name: str = "slack_notify_node"
    output_model: Type[BaseModel] = SlackNotifyNodeOutput

    # Configuration fields moved from SlackNotifyNodeConfig
    channel: str = Field("", description="The channel ID to send the message to.")
    mode: ModeEnum = Field(
        ModeEnum.BOT,
        description="The mode to send the message in. Can be 'bot' or 'user'.",
    )
    message: str = Field(
        default="",
        description="The message template to send to Slack. Use {{variable}} syntax to include data from input nodes.",
    )
    has_fixed_output: bool = True

    def model_post_init(self, _: Any) -> None:
        """Initialize after Pydantic model initialization."""
        super().model_post_init(_)
        # Set display name and logo
        self.display_name = "SlackNotify"
        self._logo = "/images/slack.png"

    async def run(self, input: BaseModel) -> BaseModel:
        """Sends a message to the specified Slack channel.
        """
        # convert data to a string and send it to the Slack channel
        if not self.message.strip():
            # If no template is provided, dump the entire input as JSON
            message = json.dumps(input.model_dump(), indent=2)
        else:
            # Render the message template with input variables
            try:
                message = Template(self.message).render(**input.model_dump())
            except Exception as e:
                print(f"[ERROR] Failed to render message template in {self.name}")
                print(f"[ERROR] Template: {self.message} with input: {input.model_dump()}")
                raise e

        client = SlackClient()
        _, status = client.send_message(
            channel=self.channel, text=message, mode=self.mode
        )  # type: ignore
        return SlackNotifyNodeOutput(status=status)

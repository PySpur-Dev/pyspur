import json
from enum import Enum
from jinja2 import Template

from pydantic import BaseModel, Field

from ....integrations.slack.client import SlackClient
from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class ModeEnum(str, Enum):
    BOT = "bot"
    USER = "user"


class SlackNotifyNodeInput(BaseNodeInput):
    """Input for the SlackNotify node"""

    class Config:
        extra = "allow"


class SlackNotifyNodeOutput(BaseNodeOutput):
    status: str = Field(
        ...,
        description="Error message if the message was not sent successfully.",
    )


class SlackNotifyNodeConfig(BaseNodeConfig):
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
    output_json_schema: str = Field(
        default=json.dumps(SlackNotifyNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class SlackNotifyNode(BaseNode):
    name = "slack_notify_node"
    display_name = "SlackNotify"
    logo = "/images/slack.png"
    category = "Slack"

    config_model = SlackNotifyNodeConfig
    input_model = SlackNotifyNodeInput
    output_model = SlackNotifyNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Sends a message to the specified Slack channel.
        """
        # convert data to a string and send it to the Slack channel
        if not self.config.message.strip():
            # If no template is provided, dump the entire input as JSON
            message = json.dumps(input.model_dump(), indent=2)
        else:
            # Render the message template with input variables
            try:
                message = Template(self.config.message).render(**input.model_dump())
            except Exception as e:
                print(f"[ERROR] Failed to render message template in {self.name}")
                print(f"[ERROR] Template: {self.config.message} with input: {input.model_dump()}")
                raise e

        client = SlackClient()
        ok, status = client.send_message(
            channel=self.config.channel, text=message, mode=self.config.mode
        )  # type: ignore
        return SlackNotifyNodeOutput(status=status)

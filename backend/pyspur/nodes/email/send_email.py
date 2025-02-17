import json
from typing import Dict, List

from pydantic import BaseModel, Field

from ..base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ..utils.template_utils import render_template_or_get_first_string
from .providers.base import (
    EmailMessage,
    EmailProvider,
    EmailProviderConfig,
    EmailResponse,
)
from .providers.registry import EmailProviderRegistry


def parse_email_addresses(email_str: str) -> List[str]:
    """
    Parse a string containing one or more email addresses.

    Args:
        email_str: A string that can be either a single email or a list of emails in the format "['email1', 'email2']"

    Returns:
        List[str]: A list of cleaned email addresses

    Example:
        >>> parse_email_addresses("test@example.com")
        ["test@example.com"]
        >>> parse_email_addresses("['test1@example.com', 'test2@example.com']")
        ["test1@example.com", "test2@example.com"]
    """
    email_str = email_str.strip()
    if email_str.startswith("[") and email_str.endswith("]"):
        # Remove brackets and split by comma
        email_str = email_str[1:-1]
        # Split by comma and clean each email
        emails = [email.strip().strip("'").strip('"') for email in email_str.split(",")]
        # Remove any empty strings
        emails = [email for email in emails if email]
        if not emails:
            raise ValueError("No valid email addresses found in the list")
        return emails
    return [email_str]


class SendEmailNodeOutput(BaseNodeOutput):
    provider: EmailProvider = Field(..., description="The email provider used")
    message_id: str = Field(..., description="The message ID from the provider")
    status: str = Field(..., description="The status of the email send operation")
    raw_response: str = Field(..., description="The raw response from the provider as JSON string")


class SendEmailNodeConfig(BaseNodeConfig):
    provider: EmailProvider = Field(
        EmailProvider.RESEND,
        description="The email provider to use",
    )
    from_template: str = Field("", description="Email address to send from")
    to_template: str = Field("", description="Email address to send to")
    subject_template: str = Field("", description="Email subject")
    content_template: str = Field("", description="Email content (plain text)")
    output_schema: Dict[str, str] = Field(
        default={
            "provider": "string",
            "message_id": "string",
            "status": "string",
            "raw_response": "string",
        },
        description="The schema for the output of the node",
    )
    has_fixed_output: bool = True
    output_json_schema: str = json.dumps(SendEmailNodeOutput.model_json_schema())


class SendEmailNodeInput(BaseNodeInput):
    """Input for the email node"""

    class Config:
        extra = "allow"


class SendEmailNode(BaseNode):
    """Node for sending an email"""

    name = "send_email_node"
    display_name = "Send Email"

    config_model = SendEmailNodeConfig
    input_model = SendEmailNodeInput
    output_model = SendEmailNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        # Create provider config
        provider_config = EmailProviderConfig()

        # Get the appropriate provider instance
        provider = EmailProviderRegistry.get_provider(self.config.provider, provider_config)

        # Render the templates
        raw_input_dict = input.model_dump()
        from_email = render_template_or_get_first_string(
            self.config.from_template, raw_input_dict, self.name
        )
        to_emails_str = render_template_or_get_first_string(
            self.config.to_template, raw_input_dict, self.name
        )

        to_emails = parse_email_addresses(to_emails_str)

        subject = render_template_or_get_first_string(
            self.config.subject_template, raw_input_dict, self.name
        )
        content = render_template_or_get_first_string(
            self.config.content_template, raw_input_dict, self.name
        )

        # Create the email message
        message = EmailMessage(
            from_email=from_email,
            to_emails=to_emails,
            subject=subject,
            content=content,
        )

        # Send the email
        response: EmailResponse = await provider.send_email(message)

        # Return the response
        return SendEmailNodeOutput(
            provider=response.provider,
            message_id=response.message_id,
            status=response.status,
            raw_response=response.raw_response,
        )

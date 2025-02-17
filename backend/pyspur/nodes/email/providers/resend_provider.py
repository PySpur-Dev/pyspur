import json
import os

import resend

from .base import (
    EmailMessage,
    EmailProvider,
    EmailProviderConfig,
    EmailResponse,
)


class ResendProvider:
    def __init__(self, config: EmailProviderConfig):
        self.config = config
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            raise ValueError("RESEND_API_KEY environment variable is not set")
        resend.api_key = api_key

    async def send_email(self, message: EmailMessage) -> EmailResponse:
        params: resend.Emails.SendParams = {
            "from": message.from_email,
            "to": message.to_emails,
            "subject": message.subject,
            "text": message.content,
        }

        try:
            response = resend.Emails.send(params)
            # Convert response to a clean dictionary format and then to JSON string
            response_dict = {
                "id": getattr(response, "id", ""),
                "from": message.from_email,
                "to": message.to_emails,
                "subject": message.subject,
            }

            return EmailResponse(
                provider=EmailProvider.RESEND,
                message_id=str(response_dict["id"]),
                status="success",
                raw_response=json.dumps(response_dict),
            )
        except Exception as e:
            error_dict = {
                "error": str(e),
                "from": message.from_email,
                "to": message.to_emails,
                "subject": message.subject,
            }
            return EmailResponse(
                provider=EmailProvider.RESEND,
                message_id="",
                status="error",
                raw_response=json.dumps(error_dict),
            )

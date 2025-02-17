from enum import Enum
from typing import List, Protocol

from pydantic import BaseModel, Field


class EmailProvider(str, Enum):
    RESEND = "resend"
    SENDGRID = "sendgrid"


class EmailProviderConfig(BaseModel):
    """Configuration for an email provider"""

    pass


class EmailMessage(BaseModel):
    """Common email message format across providers"""

    from_email: str
    to_emails: List[str]
    subject: str
    content: str


class EmailResponse(BaseModel):
    """Common response format across providers"""

    provider: EmailProvider
    message_id: str
    status: str
    raw_response: str = Field(..., description="JSON string containing the raw provider response")


class EmailProviderProtocol(Protocol):
    """Protocol that all email providers must implement"""

    def __init__(self, config: EmailProviderConfig): ...

    async def send_email(self, message: EmailMessage) -> EmailResponse:
        """Send an email using this provider"""
        ...

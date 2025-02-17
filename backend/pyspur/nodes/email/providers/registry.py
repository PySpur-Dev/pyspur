from typing import Dict, Type

from .base import EmailProvider, EmailProviderConfig, EmailProviderProtocol
from .resend_provider import ResendProvider
from .sendgrid_provider import SendGridProvider


class EmailProviderRegistry:
    _providers: Dict[EmailProvider, Type[EmailProviderProtocol]] = {
        EmailProvider.RESEND: ResendProvider,
        EmailProvider.SENDGRID: SendGridProvider,
    }

    @classmethod
    def get_provider(
        cls, provider_type: EmailProvider, config: EmailProviderConfig
    ) -> EmailProviderProtocol:
        """Get an instance of the specified email provider"""
        if provider_type not in cls._providers:
            raise ValueError(f"Unknown email provider: {provider_type}")

        provider_class = cls._providers[provider_type]
        return provider_class(config)

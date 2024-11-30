from fastapi import HTTPException, Request
from typing import Dict, Optional
import time
from datetime import datetime, timedelta
import asyncio
import logging

logger = logging.getLogger(__name__)

class RateLimiter:
    def __init__(self, calls: int, period: int):
        """
        Initialize rate limiter
        :param calls: Number of calls allowed per period
        :param period: Time period in seconds
        """
        self.calls = calls
        self.period = period
        self.tokens: Dict[str, list] = {}
        self._cleanup_task = asyncio.create_task(self._cleanup_old_tokens())

    async def _cleanup_old_tokens(self):
        """Periodically clean up old tokens"""
        while True:
            try:
                current_time = time.time()
                for key in list(self.tokens.keys()):
                    self.tokens[key] = [t for t in self.tokens[key]
                                      if current_time - t <= self.period]
                    if not self.tokens[key]:
                        del self.tokens[key]
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")
            await asyncio.sleep(self.period)

    async def is_allowed(self, key: str) -> bool:
        """
        Check if request is allowed
        :param key: Identifier for the client (e.g. API key)
        :return: True if request is allowed, False otherwise
        """
        current = time.time()
        if key not in self.tokens:
            self.tokens[key] = []

        # Remove old tokens
        self.tokens[key] = [t for t in self.tokens[key]
                           if current - t <= self.period]

        # Check if we're under the limit
        if len(self.tokens[key]) < self.calls:
            self.tokens[key].append(current)
            return True
        return False
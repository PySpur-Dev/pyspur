# utils.py
from typing import Any
import httpx

from registry import ToolRegistry

NWS_API_BASE = "https://api.weather.gov"
USER_AGENT = "weather-app/1.0"


@ToolRegistry.register(
    description="Make a request to the NWS API with minimal error handling",
)
async def make_nws_request(url: str) -> dict[str, Any] | None:
    """
    Make a request to the NWS API with minimal error handling.
    """
    headers = {"User-Agent": USER_AGENT, "Accept": "application/geo+json"}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
        except Exception:
            return None

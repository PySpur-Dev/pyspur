# tools/alerts.py

from typing import Any
from utils import make_nws_request, NWS_API_BASE
from registry import ToolRegistry


def format_alert(feature: dict[str, Any]) -> str:
    props = feature["properties"]
    return f"""
Event: {props.get('event', 'Unknown')}
Area: {props.get('areaDesc', 'Unknown')}
Severity: {props.get('severity', 'Unknown')}
Description: {props.get('description', 'No description available')}
Instructions: {props.get('instruction', 'No instructions provided')}
"""


@ToolRegistry.register(
    description="Get active weather alerts for a US state using its two-letter code",
)
async def get_alerts(state: str) -> str:
    """Get weather alerts for a US state (two-letter code, e.g. 'CA')."""
    url = f"{NWS_API_BASE}/alerts/active/area/{state}"
    data = await make_nws_request(url)

    if not data or "features" not in data:
        return "Unable to fetch alerts or no alerts found."

    if not data["features"]:
        return "No active alerts for this state."

    alerts = [format_alert(feature) for feature in data["features"]]
    return "\n---\n".join(alerts)

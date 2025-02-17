import json
import logging
from typing import List, Optional

import requests
from pydantic import BaseModel, Field

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class FacebookAdLibraryNodeInput(BaseNodeInput):
    """Input for the FacebookAdLibrary node"""

    class Config:
        extra = "allow"


class FacebookAdLibraryNodeOutput(BaseNodeOutput):
    ads: str = Field(..., description="JSON string containing the retrieved ad data")


class FacebookAdLibraryNodeConfig(BaseNodeConfig):
    access_token: str = Field("", description="Meta API access token for authentication")
    profile_url: str = Field("", description="Facebook profile URL to search ads for")
    country_code: str = Field(
        "US",
        description="Two-letter country code for ad search (e.g., US, GB, DE)",
    )
    media_type: str = Field("ALL", description="Type of media to search for (ALL, IMAGE, VIDEO)")
    platforms: List[str] = Field(
        default=["FACEBOOK", "INSTAGRAM"],
        description="Platforms to search ads on (FACEBOOK, INSTAGRAM)",
    )
    max_ads: int = Field(100, description="Maximum number of ads to retrieve (max 500)")
    ad_active_status: str = Field(
        "ACTIVE", description="Filter by ad status (ACTIVE, INACTIVE, ALL)"
    )
    fields: List[str] = Field(
        default=[
            "ad_creation_time",
            "ad_creative_body",
            "ad_creative_link_caption",
            "ad_creative_link_description",
            "ad_creative_link_title",
            "ad_snapshot_url",
            "page_id",
            "page_name",
            "publisher_platforms",
            "spend",
            "impressions",
        ],
        description="Fields to retrieve from the Ad Library API",
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(FacebookAdLibraryNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )

    def __init__(self, **data):
        super().__init__(**data)


class FacebookAdLibraryNode(BaseNode):
    name = "facebook_ad_library_node"
    display_name = "FacebookAdLibrary"
    logo = "/images/meta.png"
    category = "Meta"

    config_model = FacebookAdLibraryNodeConfig
    input_model = FacebookAdLibraryNodeInput
    output_model = FacebookAdLibraryNodeOutput

    def _extract_page_id(self, profile_url: str) -> Optional[str]:
        """Extract page ID from Facebook profile URL"""
        # This is a simplified version - you may need to enhance this based on URL formats
        try:
            if "facebook.com" not in profile_url:
                return None
            parts = profile_url.rstrip("/").split("/")
            return parts[-1]
        except Exception:
            return None

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            page_id = self._extract_page_id(self.config.profile_url)
            if not page_id:
                raise ValueError("Invalid Facebook profile URL")

            api_version = "v18.0"  # Using latest stable version
            base_url = f"https://graph.facebook.com/{api_version}/ads_archive"

            params = {
                "access_token": self.config.access_token,
                "search_page_ids": page_id,
                "ad_reached_countries": self.config.country_code,
                "ad_active_status": self.config.ad_active_status,
                "limit": min(500, self.config.max_ads),  # API limit is 500
                "fields": ",".join(self.config.fields),
                "ad_type": self.config.media_type,
                "publisher_platforms": ",".join(self.config.platforms),
            }

            response = requests.get(base_url, params=params)
            if response.status_code != 200:
                raise Exception(f"API request failed: {response.text}")

            data = response.json()

            # Format and return the results
            ads_data = data.get("data", [])
            if len(ads_data) > self.config.max_ads:
                ads_data = ads_data[: self.config.max_ads]

            return FacebookAdLibraryNodeOutput(ads=json.dumps(ads_data))

        except Exception as e:
            logging.error(f"Failed to retrieve Facebook ads: {str(e)}")
            return FacebookAdLibraryNodeOutput(ads="[]")

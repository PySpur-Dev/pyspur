import json
import logging
import os
from typing import List

import praw
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class RedditGetSubredditInfoNodeInput(BaseNodeInput):
    """Input for the RedditGetSubredditInfo node"""

    class Config:
        extra = "allow"


class SubredditInfo(BaseModel):
    display_name: str = Field(..., description="Display name of the subreddit")
    title: str = Field(..., description="Title of the subreddit")
    description: str = Field(..., description="Full description of the subreddit")
    subscribers: int = Field(..., description="Number of subscribers")
    created_utc: float = Field(..., description="Creation timestamp in UTC")
    over18: bool = Field(..., description="Whether the subreddit is NSFW")
    available_flairs: List[str] = Field(..., description="List of available post flairs")
    public_description: str = Field(..., description="Public description of the subreddit")
    url: str = Field(..., description="URL of the subreddit")


class RedditGetSubredditInfoNodeOutput(BaseNodeOutput):
    subreddit_info: SubredditInfo = Field(..., description="The subreddit information")


# Define a simple schema without complex nested structures
SIMPLE_OUTPUT_SCHEMA = {
    "title": "RedditGetSubredditInfoNodeOutput",
    "type": "object",
    "properties": {
        "subreddit_info": {
            "title": "Subreddit Info",
            "type": "object",
            "description": "The subreddit information",
        }
    },
    "required": ["subreddit_info"],
}


class RedditGetSubredditInfoNodeConfig(BaseNodeConfig):
    subreddit_name: str = Field("", description="The name of the subreddit to get information for.")
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(SIMPLE_OUTPUT_SCHEMA),
        description="The JSON schema for the output of the node",
    )


class RedditGetSubredditInfoNode(BaseNode):
    name = "reddit_get_subreddit_info_node"
    display_name = "RedditGetSubredditInfo"
    logo = "/images/reddit.png"
    category = "Reddit"

    config_model = RedditGetSubredditInfoNodeConfig
    input_model = RedditGetSubredditInfoNodeInput
    output_model = RedditGetSubredditInfoNodeOutput

    def setup(self) -> None:
        """Override setup to handle schema issues"""
        try:
            super().setup()
        except ValueError as e:
            if "Unsupported JSON schema type" in str(e):
                # If we hit schema issues, use a very basic setup
                logging.warning(f"Schema error: {e}, using simplified approach")

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            client_id = os.getenv("REDDIT_CLIENT_ID")
            client_secret = os.getenv("REDDIT_CLIENT_SECRET")
            user_agent = os.getenv("REDDIT_USER_AGENT", "RedditTools v1.0")

            if not client_id or not client_secret:
                raise ValueError("Reddit API credentials not found in environment variables")

            reddit = praw.Reddit(
                client_id=client_id,
                client_secret=client_secret,
                user_agent=user_agent,
            )

            subreddit = reddit.subreddit(self.config.subreddit_name)
            flairs = [flair["text"] for flair in subreddit.flair.link_templates]
            info = SubredditInfo(
                display_name=subreddit.display_name,
                title=subreddit.title,
                description=subreddit.description,
                subscribers=subreddit.subscribers,
                created_utc=subreddit.created_utc,
                over18=subreddit.over18,
                available_flairs=flairs,
                public_description=subreddit.public_description,
                url=subreddit.url,
            )
            return RedditGetSubredditInfoNodeOutput(subreddit_info=info)
        except Exception as e:
            logging.error(f"Failed to get subreddit info: {e}")
            raise e

import json
import logging
import os
from typing import List

import praw
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class RedditGetTrendingSubredditsNodeInput(BaseNodeInput):
    """Input for the RedditGetTrendingSubreddits node"""

    class Config:
        extra = "allow"


class TrendingSubreddit(BaseModel):
    name: str = Field(..., description="Display name of the subreddit")
    title: str = Field(..., description="Title of the subreddit")
    description: str = Field(..., description="Public description of the subreddit")
    subscribers: int = Field(..., description="Number of subscribers")
    url: str = Field(..., description="URL of the subreddit")
    over18: bool = Field(..., description="Whether the subreddit is NSFW")


class RedditGetTrendingSubredditsNodeOutput(BaseNodeOutput):
    trending_subreddits: List[TrendingSubreddit] = Field(
        ..., description="List of trending subreddits"
    )


# Define a simple schema without complex nested structures
SIMPLE_OUTPUT_SCHEMA = {
    "title": "RedditGetTrendingSubredditsNodeOutput",
    "type": "object",
    "properties": {
        "trending_subreddits": {
            "title": "Trending Subreddits",
            "type": "array",
            "description": "List of trending subreddits",
            "items": {"type": "object"},
        }
    },
    "required": ["trending_subreddits"],
}


class RedditGetTrendingSubredditsNodeConfig(BaseNodeConfig):
    limit: int = Field(5, description="Number of trending subreddits to fetch (max 100).")
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(SIMPLE_OUTPUT_SCHEMA),
        description="The JSON schema for the output of the node",
    )


class RedditGetTrendingSubredditsNode(BaseNode):
    name = "reddit_get_trending_subreddits_node"
    display_name = "RedditGetTrendingSubreddits"
    logo = "/images/reddit.png"
    category = "Reddit"

    config_model = RedditGetTrendingSubredditsNodeConfig
    input_model = RedditGetTrendingSubredditsNodeInput
    output_model = RedditGetTrendingSubredditsNodeOutput

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

            popular_subreddits = reddit.subreddits.popular(limit=min(self.config.limit, 100))
            trending = [
                TrendingSubreddit(
                    name=subreddit.display_name,
                    title=subreddit.title,
                    description=subreddit.public_description,
                    subscribers=subreddit.subscribers,
                    url=subreddit.url,
                    over18=subreddit.over18,
                )
                for subreddit in popular_subreddits
            ]

            return RedditGetTrendingSubredditsNodeOutput(trending_subreddits=trending)
        except Exception as e:
            logging.error(f"Failed to get trending subreddits: {e}")
            raise e

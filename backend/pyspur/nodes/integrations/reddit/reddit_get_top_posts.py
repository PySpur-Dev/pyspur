import json
import logging
import os
from typing import List, Optional

import praw
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class RedditGetTopPostsNodeInput(BaseNodeInput):
    """Input for the RedditGetTopPosts node."""

    class Config:
        extra = "allow"


class RedditPost(BaseModel):
    title: str = Field(..., description="Title of the post")
    score: int = Field(..., description="Score (upvotes) of the post")
    url: str = Field(..., description="URL of the post")
    author: str = Field(..., description="Username of the post author")
    created_utc: float = Field(..., description="Creation timestamp in UTC")
    num_comments: int = Field(..., description="Number of comments on the post")
    permalink: str = Field(..., description="Reddit permalink to the post")
    is_self: bool = Field(..., description="Whether this is a self (text) post")
    selftext: Optional[str] = Field(None, description="Text content if this is a self post")


class RedditGetTopPostsNodeOutput(BaseNodeOutput):
    top_posts: List[RedditPost] = Field(..., description="List of top posts from the subreddit")


# Define a simple schema without complex nested structures
SIMPLE_OUTPUT_SCHEMA = {
    "title": "RedditGetTopPostsNodeOutput",
    "type": "object",
    "properties": {
        "top_posts": {
            "title": "Top Posts",
            "type": "array",
            "description": "List of top posts from the subreddit",
            "items": {"type": "object"},
        }
    },
    "required": ["top_posts"],
}


class RedditGetTopPostsNodeConfig(BaseNodeConfig):
    subreddit: str = Field("", description="The name of the subreddit to get posts from.")
    time_filter: str = Field(
        "week", description="Time period to filter posts (hour, day, week, month, year, all)."
    )
    limit: int = Field(10, description="Number of posts to fetch (max 100).")
    only_self_posts: bool = Field(False, description="When True, only return self (text) posts.")
    has_fixed_output: bool = True

    # Use a simple predefined schema
    output_json_schema: str = Field(
        default=json.dumps(SIMPLE_OUTPUT_SCHEMA),
        description="The JSON schema for the output of the node",
    )


class RedditGetTopPostsNode(BaseNode):
    name = "reddit_get_top_posts_node"
    display_name = "RedditGetTopPosts"
    logo = "/images/reddit.png"
    category = "Reddit"

    config_model = RedditGetTopPostsNodeConfig
    input_model = RedditGetTopPostsNodeInput
    output_model = RedditGetTopPostsNodeOutput

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

            posts = reddit.subreddit(self.config.subreddit).top(
                time_filter=self.config.time_filter,
                limit=min(self.config.limit, 100),  # Cap at 100 posts
            )

            top_posts = [
                RedditPost(
                    title=post.title,
                    score=post.score,
                    url=post.url,
                    author=str(post.author),
                    created_utc=post.created_utc,
                    num_comments=post.num_comments,
                    permalink=post.permalink,
                    is_self=post.is_self,
                    selftext=post.selftext if post.is_self else None,
                )
                for post in posts
                if not self.config.only_self_posts or post.is_self
            ]

            return RedditGetTopPostsNodeOutput(top_posts=top_posts)
        except Exception as e:
            logging.error(f"Failed to get top posts: {e}")
            raise e

import json
import logging
import os
from typing import Optional

import praw
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class RedditCreatePostNodeInput(BaseNodeInput):
    """Input for the RedditCreatePost node."""

    class Config:
        extra = "allow"


class CreatedPostInfo(BaseModel):
    id: str = Field(..., description="ID of the created post")
    title: str = Field(..., description="Title of the created post")
    url: str = Field(..., description="URL of the created post")
    permalink: str = Field(..., description="Reddit permalink to the post")
    created_utc: float = Field(..., description="Creation timestamp in UTC")
    author: str = Field(..., description="Username of the post author")
    flair: Optional[str] = Field(None, description="Flair text of the post if any")


class RedditCreatePostError(BaseModel):
    error: str = Field(..., description="Error message explaining what went wrong")


class RedditCreatePostNodeOutput(BaseNodeOutput):
    post_info: CreatedPostInfo | RedditCreatePostError = Field(
        ..., description="Information about the created post or error details"
    )


class RedditCreatePostNodeConfig(BaseNodeConfig):
    subreddit: str = Field("", description="The subreddit to post in.")
    title: str = Field("", description="The title of the post.")
    content: str = Field(
        "", description="The content of the post (text for self posts, URL for link posts)."
    )
    flair: Optional[str] = Field(None, description="Optional flair to add to the post.")
    is_self: bool = Field(True, description="Whether this is a self (text) post or link post.")
    username: str = Field(
        "", description="Reddit username. Can also be set via REDDIT_USERNAME environment variable."
    )
    password: str = Field(
        "", description="Reddit password. Can also be set via REDDIT_PASSWORD environment variable."
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(RedditCreatePostNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class RedditCreatePostNode(BaseNode):
    name = "reddit_create_post_node"
    display_name = "RedditCreatePost"
    logo = "/images/reddit.png"
    category = "Reddit"

    config_model = RedditCreatePostNodeConfig
    input_model = RedditCreatePostNodeInput
    output_model = RedditCreatePostNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            client_id = os.getenv("REDDIT_CLIENT_ID")
            client_secret = os.getenv("REDDIT_CLIENT_SECRET")
            user_agent = os.getenv("REDDIT_USER_AGENT", "RedditTools v1.0")
            username = os.getenv("REDDIT_USERNAME") or self.config.username
            password = os.getenv("REDDIT_PASSWORD") or self.config.password

            if not client_id or not client_secret:
                raise ValueError("Reddit API credentials not found in environment variables")

            if not username or not password:
                raise ValueError("Reddit username and password are required for creating posts")

            reddit = praw.Reddit(
                client_id=client_id,
                client_secret=client_secret,
                user_agent=user_agent,
                username=username,
                password=password,
            )

            # Verify authentication
            try:
                reddit.user.me()
            except Exception as e:
                logging.error(f"Authentication error: {e}")
                return RedditCreatePostNodeOutput(
                    post_info=RedditCreatePostError(error="Failed to authenticate with Reddit")
                )

            subreddit = reddit.subreddit(self.config.subreddit)

            # Check flair if provided
            if self.config.flair:
                available_flairs = [f["text"] for f in subreddit.flair.link_templates]
                if self.config.flair not in available_flairs:
                    return RedditCreatePostNodeOutput(
                        post_info=RedditCreatePostError(
                            error=f"Invalid flair. Available flairs: {', '.join(available_flairs)}"
                        )
                    )

            # Create the post
            if self.config.is_self:
                submission = subreddit.submit(
                    title=self.config.title,
                    selftext=self.config.content,
                    flair_id=self.config.flair,
                )
            else:
                submission = subreddit.submit(
                    title=self.config.title,
                    url=self.config.content,
                    flair_id=self.config.flair,
                )

            post_info = CreatedPostInfo(
                id=submission.id,
                title=submission.title,
                url=submission.url,
                permalink=submission.permalink,
                created_utc=submission.created_utc,
                author=str(submission.author),
                flair=submission.link_flair_text,
            )

            return RedditCreatePostNodeOutput(post_info=post_info)
        except Exception as e:
            logging.error(f"Failed to create post: {e}")
            return RedditCreatePostNodeOutput(
                post_info=RedditCreatePostError(error=f"Failed to create post: {str(e)}")
            )

import json
import logging
import os
from pydantic import BaseModel, Field  # type: ignore
from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
import praw


class RedditGetUserInfoNodeInput(BaseNodeInput):
    """Input for the RedditGetUserInfo node"""

    class Config:
        extra = "allow"


class RedditUserInfo(BaseModel):
    name: str = Field(..., description="Username of the Reddit user")
    comment_karma: int = Field(..., description="Total karma from comments")
    link_karma: int = Field(..., description="Total karma from posts/links")
    is_mod: bool = Field(..., description="Whether the user is a moderator")
    is_gold: bool = Field(..., description="Whether the user has Reddit gold")
    is_employee: bool = Field(..., description="Whether the user is a Reddit employee")
    created_utc: float = Field(..., description="Account creation timestamp in UTC")


class RedditGetUserInfoNodeOutput(BaseNodeOutput):
    user_info: RedditUserInfo = Field(..., description="Information about the Reddit user")


class RedditGetUserInfoNodeConfig(BaseNodeConfig):
    username: str = Field("", description="The Reddit username to get information for.")
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(RedditGetUserInfoNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class RedditGetUserInfoNode(BaseNode):
    name = "reddit_get_user_info_node"
    display_name = "RedditGetUserInfo"
    logo = "/images/reddit.png"
    category = "Reddit"

    config_model = RedditGetUserInfoNodeConfig
    input_model = RedditGetUserInfoNodeInput
    output_model = RedditGetUserInfoNodeOutput

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

            user = reddit.redditor(self.config.username)
            info = RedditUserInfo(
                name=user.name,
                comment_karma=user.comment_karma,
                link_karma=user.link_karma,
                is_mod=user.is_mod,
                is_gold=user.is_gold,
                is_employee=user.is_employee,
                created_utc=user.created_utc,
            )
            return RedditGetUserInfoNodeOutput(user_info=info)
        except Exception as e:
            logging.error(f"Failed to get user info: {e}")
            raise e
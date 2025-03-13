import json
import logging
import os

import praw
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class RedditGetSubredditStatsNodeInput(BaseNodeInput):
    """Input for the RedditGetSubredditStats node"""

    class Config:
        extra = "allow"


class RecentActivity(BaseModel):
    total_comments_last_100_posts: int = Field(
        ..., description="Total number of comments in the last 100 posts"
    )
    total_score_last_100_posts: int = Field(..., description="Total score of the last 100 posts")
    average_comments_per_post: float = Field(..., description="Average number of comments per post")
    average_score_per_post: float = Field(..., description="Average score per post")


class SubredditStats(BaseModel):
    display_name: str = Field(..., description="Display name of the subreddit")
    subscribers: int = Field(..., description="Number of subscribers")
    active_users: int = Field(..., description="Number of active users")
    description: str = Field(..., description="Full description of the subreddit")
    created_utc: float = Field(..., description="Creation timestamp in UTC")
    over18: bool = Field(..., description="Whether the subreddit is NSFW")
    public_description: str = Field(..., description="Public description of the subreddit")
    recent_activity: RecentActivity = Field(..., description="Recent activity statistics")


class RedditGetSubredditStatsNodeOutput(BaseNodeOutput):
    subreddit_stats: SubredditStats = Field(..., description="The subreddit statistics")


# Define a simple schema without complex nested structures
SIMPLE_OUTPUT_SCHEMA = {
    "title": "RedditGetSubredditStatsNodeOutput",
    "type": "object",
    "properties": {
        "subreddit_stats": {
            "title": "Subreddit Stats",
            "type": "object",
            "description": "The subreddit statistics",
        }
    },
    "required": ["subreddit_stats"],
}


class RedditGetSubredditStatsNodeConfig(BaseNodeConfig):
    subreddit: str = Field("", description="The name of the subreddit to get statistics for.")
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(SIMPLE_OUTPUT_SCHEMA),
        description="The JSON schema for the output of the node",
    )


class RedditGetSubredditStatsNode(BaseNode):
    name = "reddit_get_subreddit_stats_node"
    display_name = "RedditGetSubredditStats"
    logo = "/images/reddit.png"
    category = "Reddit"

    config_model = RedditGetSubredditStatsNodeConfig
    input_model = RedditGetSubredditStatsNodeInput
    output_model = RedditGetSubredditStatsNodeOutput

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

            subreddit = reddit.subreddit(self.config.subreddit)

            # Get recent posts for activity metrics
            recent_posts = list(subreddit.new(limit=100))
            total_comments = sum(post.num_comments for post in recent_posts)
            total_score = sum(post.score for post in recent_posts)

            stats = SubredditStats(
                display_name=subreddit.display_name,
                subscribers=subreddit.subscribers,
                active_users=subreddit.active_user_count,
                description=subreddit.description,
                created_utc=subreddit.created_utc,
                over18=subreddit.over18,
                public_description=subreddit.public_description,
                recent_activity=RecentActivity(
                    total_comments_last_100_posts=total_comments,
                    total_score_last_100_posts=total_score,
                    average_comments_per_post=total_comments / len(recent_posts)
                    if recent_posts
                    else 0,
                    average_score_per_post=total_score / len(recent_posts) if recent_posts else 0,
                ),
            )

            return RedditGetSubredditStatsNodeOutput(subreddit_stats=stats)
        except Exception as e:
            logging.error(f"Failed to get subreddit stats: {e}")
            raise e

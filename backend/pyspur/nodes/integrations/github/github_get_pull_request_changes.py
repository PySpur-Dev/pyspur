import json
import logging
from typing import Optional

from phi.tools.github import GithubTools
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class GitHubGetPullRequestChangesNodeInput(BaseNodeInput):
    """Input for the GitHubGetPullRequestChanges node"""

    class Config:
        extra = "allow"


class GitHubGetPullRequestChangesNodeOutput(BaseNodeOutput):
    pull_request_changes: str = Field(
        ...,
        description="The list of changed files in the pull request in JSON format.",
    )


class GitHubGetPullRequestChangesNodeConfig(BaseNodeConfig):
    repo_name: str = Field("", description="The full name of the repository (e.g. 'owner/repo').")
    pr_number: Optional[int] = Field(None, description="The pull request number.")
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(GitHubGetPullRequestChangesNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class GitHubGetPullRequestChangesNode(BaseNode):
    name = "github_get_pull_request_changes_node"
    display_name = "GitHubGetPullRequestChanges"
    logo = "/images/github.png"
    category = "GitHub"

    config_model = GitHubGetPullRequestChangesNodeConfig
    input_model = GitHubGetPullRequestChangesNodeInput
    output_model = GitHubGetPullRequestChangesNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            gh = GithubTools()
            pr_changes = gh.get_pull_request_changes(
                repo_name=self.config.repo_name, pr_number=self.config.pr_number
            )
            return GitHubGetPullRequestChangesNodeOutput(pull_request_changes=pr_changes)
        except Exception as e:
            logging.error(f"Failed to get pull request changes: {e}")
            return GitHubGetPullRequestChangesNodeOutput(pull_request_changes="")

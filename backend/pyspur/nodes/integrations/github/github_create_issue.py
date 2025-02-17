import json
import logging
from typing import Optional

from phi.tools.github import GithubTools
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class GitHubCreateIssueNodeInput(BaseNodeInput):
    """Input for the GitHubCreateIssue node"""

    class Config:
        extra = "allow"


class GitHubCreateIssueNodeOutput(BaseNodeOutput):
    issue: str = Field(..., description="The created issue details in JSON format.")


class GitHubCreateIssueNodeConfig(BaseNodeConfig):
    repo_name: str = Field("", description="The full name of the repository (e.g. 'owner/repo').")
    issue_title: str = Field("", description="The title of the issue.")
    body: Optional[str] = Field(None, description="The body content of the issue.")
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(GitHubCreateIssueNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class GitHubCreateIssueNode(BaseNode):
    name = "github_create_issue_node"
    display_name = "GitHubCreateIssue"
    logo = "/images/github.png"
    category = "GitHub"

    config_model = GitHubCreateIssueNodeConfig
    input_model = GitHubCreateIssueNodeInput
    output_model = GitHubCreateIssueNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            gh = GithubTools()
            issue_info = gh.create_issue(
                repo_name=self.config.repo_name,
                title=self.config.issue_title,
                body=self.config.body,
            )
            return GitHubCreateIssueNodeOutput(issue=issue_info)
        except Exception as e:
            logging.error(f"Failed to create issue: {e}")
            return GitHubCreateIssueNodeOutput(issue="")

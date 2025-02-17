import json
import logging

from phi.tools.github import GithubTools
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class GitHubGetRepositoryNodeInput(BaseNodeInput):
    """Input for the GitHubGetRepository node"""

    class Config:
        extra = "allow"


class GitHubGetRepositoryNodeOutput(BaseNodeOutput):
    repository_details: str = Field(
        ..., description="Details of the requested repository in JSON format."
    )


class GitHubGetRepositoryNodeConfig(BaseNodeConfig):
    repo_name: str = Field("", description="The full name of the repository (e.g. 'owner/repo').")
    output_json_schema: str = Field(
        default=json.dumps(GitHubGetRepositoryNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )
    has_fixed_output: bool = True


class GitHubGetRepositoryNode(BaseNode):
    name = "github_get_repository_node"
    display_name = "GitHubGetRepository"
    logo = "/images/github.png"
    category = "GitHub"

    config_model = GitHubGetRepositoryNodeConfig
    input_model = GitHubGetRepositoryNodeInput
    output_model = GitHubGetRepositoryNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            gh = GithubTools()
            repo_details = gh.get_repository(repo_name=self.config.repo_name)
            return GitHubGetRepositoryNodeOutput(repository_details=repo_details)
        except Exception as e:
            logging.error(f"Failed to get repository details: {e}")
            return GitHubGetRepositoryNodeOutput(repository_details="")

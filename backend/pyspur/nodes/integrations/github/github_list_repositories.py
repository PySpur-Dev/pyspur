import json
import logging

from phi.tools.github import GithubTools
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class GitHubListRepositoriesNodeInput(BaseNodeInput):
    """Input for the GitHubListRepositories node"""

    class Config:
        extra = "allow"


class GitHubListRepositoriesNodeOutput(BaseNodeOutput):
    repositories: str = Field(..., description="A JSON string of the repositories for the user.")


class GitHubListRepositoriesNodeConfig(BaseNodeConfig):
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(GitHubListRepositoriesNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class GitHubListRepositoriesNode(BaseNode):
    name = "github_list_repositories_node"
    display_name = "GitHubListRepositories"
    logo = "/images/github.png"
    category = "GitHub"

    config_model = GitHubListRepositoriesNodeConfig
    input_model = GitHubListRepositoriesNodeInput
    output_model = GitHubListRepositoriesNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            gh = GithubTools()
            repositories = gh.list_repositories()
            return GitHubListRepositoriesNodeOutput(repositories=repositories)
        except Exception as e:
            logging.error(f"Failed to list repositories: {e}")
            return GitHubListRepositoriesNodeOutput(repositories="")

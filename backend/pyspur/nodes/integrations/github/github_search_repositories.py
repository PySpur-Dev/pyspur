import json
import logging

from phi.tools.github import GithubTools
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class GitHubSearchRepositoriesNodeInput(BaseNodeInput):
    """Input for the GitHubSearchRepositories node"""

    class Config:
        extra = "allow"


class GitHubSearchRepositoriesNodeOutput(BaseNodeOutput):
    repositories: str = Field(
        ...,
        description="A JSON string of repositories matching the search query.",
    )


class GitHubSearchRepositoriesNodeConfig(BaseNodeConfig):
    query: str = Field(..., description="The search query keywords (e.g. 'machine learning').")
    sort: str = Field(
        "stars",
        description="The field to sort results by. Can be 'stars', 'forks', or 'updated'.",
    )
    order: str = Field("desc", description="The order of results. Can be 'asc' or 'desc'.")
    per_page: int = Field(5, description="Number of results per page.")
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(GitHubSearchRepositoriesNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class GitHubSearchRepositoriesNode(BaseNode):
    name = "github_search_repositories_node"
    display_name = "GitHubSearchRepositories"
    logo = "/images/github.png"
    category = "GitHub"

    config_model = GitHubSearchRepositoriesNodeConfig
    input_model = GitHubSearchRepositoriesNodeInput
    output_model = GitHubSearchRepositoriesNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            gh = GithubTools()
            repos = gh.search_repositories(
                query=self.config.query,
                sort=self.config.sort,
                order=self.config.order,
                per_page=self.config.per_page,
            )
            return GitHubSearchRepositoriesNodeOutput(repositories=repos)
        except Exception as e:
            logging.error(f"Failed to search repositories: {e}")
            return GitHubSearchRepositoriesNodeOutput(repositories="")

import json
import logging

from phi.tools.github import GithubTools
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class GitHubListPullRequestsNodeInput(BaseNodeInput):
    """Input for the GitHubListPullRequests node"""

    class Config:
        extra = "allow"


class GitHubListPullRequestsNodeOutput(BaseNodeOutput):
    pull_requests: str = Field(..., description="The pull requests for the repository.")


class GitHubListPullRequestsNodeConfig(BaseNodeConfig):
    repo_name: str = Field(
        "",
        description="The GitHub repository URL to fetch the pull requests for.",
    )
    state: str = Field(
        "open",
        description="The state of the pull requests to fetch. Can be 'open', 'closed', or 'all'.",
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(GitHubListPullRequestsNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class GitHubListPullRequestsNode(BaseNode):
    name = "github_list_pull_requests_node"
    display_name = "GitHubListPullRequests"
    logo = "/images/github.png"
    category = "GitHub"

    config_model = GitHubListPullRequestsNodeConfig
    input_model = GitHubListPullRequestsNodeInput
    output_model = GitHubListPullRequestsNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Fetches the pull requests for a given GitHub repository URL and state.
        """
        try:
            gh = GithubTools()
            pull_requests = gh.list_pull_requests(
                repo_name=self.config.repo_name, state=self.config.state
            )
            return GitHubListPullRequestsNodeOutput(pull_requests=pull_requests)
        except Exception as e:
            logging.error(f"Failed to get pull requests: {e}")
            return GitHubListPullRequestsNodeOutput(pull_requests="")


if __name__ == "__main__":
    import asyncio

    async def main():
        # Example usage
        node = GitHubListPullRequestsNode(
            name="github_list_pull_requests_node",
            config=GitHubListPullRequestsNodeConfig(
                repo_name="parshva-bhadra/pyspur", state="closed"
            ),
        )
        input_data = GitHubListPullRequestsNodeInput()
        output = await node.run(input_data)
        print(output)

    asyncio.run(main())

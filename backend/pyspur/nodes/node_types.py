from typing import Dict, List

from ..schemas.node_type_schemas import NodeTypeSchema
from .registry import NodeRegistry

# Simple lists of supported and deprecated node types

LOGIC = [
    {
        "node_type_name": "RouterNode",
        "module": ".nodes.logic.router",
        "class_name": "RouterNode",
    },
    {
        "node_type_name": "CoalesceNode",
        "module": ".nodes.logic.coalesce",
        "class_name": "CoalesceNode",
    },
    {
        "node_type_name": "MergeNode",
        "module": ".nodes.logic.merge",
        "class_name": "MergeNode",
    },
]

SUPPORTED_NODE_TYPES = {
    "Input/Output": [
        {
            "node_type_name": "InputNode",
            "module": ".nodes.primitives.input",
            "class_name": "InputNode",
        },
        {
            "node_type_name": "OutputNode",
            "module": ".nodes.primitives.output",
            "class_name": "OutputNode",
        },
    ],
    "AI": [
        {
            "node_type_name": "SingleLLMCallNode",
            "module": ".nodes.llm.single_llm_call",
            "class_name": "SingleLLMCallNode",
        },
        {
            "node_type_name": "BestOfNNode",
            "module": ".nodes.llm.generative.best_of_n",
            "class_name": "BestOfNNode",
        },
    ],
    "Code Execution": [
        {
            "node_type_name": "PythonFuncNode",
            "module": ".nodes.python.python_func",
            "class_name": "PythonFuncNode",
        },
    ],
    "Logic": LOGIC,
    "Experimental": [
        {
            "node_type_name": "ForLoopNode",
            "module": ".nodes.loops.for_loop_node",
            "class_name": "ForLoopNode",
        },
        {
            "node_type_name": "RetrieverNode",
            "module": ".nodes.llm.retriever",
            "class_name": "RetrieverNode",
        },
    ],
    "Integrations": [
        {
            "node_type_name": "SlackNotifyNode",
            "module": ".nodes.integrations.slack.slack_notify",
            "class_name": "SlackNotifyNode",
        },
        {
            "node_type_name": "GoogleSheetsReadNode",
            "module": ".nodes.integrations.google.google_sheets_read",
            "class_name": "GoogleSheetsReadNode",
        },
        {
            "node_type_name": "YouTubeTranscriptNode",
            "module": ".nodes.integrations.youtube.youtube_transcript",
            "class_name": "YouTubeTranscriptNode",
        },
        {
            "node_type_name": "GitHubListPullRequestsNode",
            "module": ".nodes.integrations.github.github_list_pull_requests",
            "class_name": "GitHubListPullRequestsNode",
        },
        {
            "node_type_name": "GitHubListRepositoriesNode",
            "module": ".nodes.integrations.github.github_list_repositories",
            "class_name": "GitHubListRepositoriesNode",
        },
        {
            "node_type_name": "GitHubGetRepositoryNode",
            "module": ".nodes.integrations.github.github_get_repository",
            "class_name": "GitHubGetRepositoryNode",
        },
        {
            "node_type_name": "GitHubSearchRepositoriesNode",
            "module": ".nodes.integrations.github.github_search_repositories",
            "class_name": "GitHubSearchRepositoriesNode",
        },
        {
            "node_type_name": "GitHubGetPullRequestNode",
            "module": ".nodes.integrations.github.github_get_pull_request",
            "class_name": "GitHubGetPullRequestNode",
        },
        {
            "node_type_name": "GitHubGetPullRequestChangesNode",
            "module": ".nodes.integrations.github.github_get_pull_request_changes",
            "class_name": "GitHubGetPullRequestChangesNode",
        },
        {
            "node_type_name": "GitHubCreateIssueNode",
            "module": ".nodes.integrations.github.github_create_issue",
            "class_name": "GitHubCreateIssueNode",
        },
        # {
        #     "node_type_name": "FirecrawlCrawlNode",
        #     "module": ".nodes.integrations.firecrawl.firecrawl_crawl",
        #     "class_name": "FirecrawlCrawlNode",
        # },
        # {
        #     "node_type_name": "FirecrawlScrapeNode",
        #     "module": ".nodes.integrations.firecrawl.firecrawl_scrape",
        #     "class_name": "FirecrawlScrapeNode",
        # },
        {
            "node_type_name": "JinaReaderNode",
            "module": ".nodes.integrations.jina.jina_reader",
            "class_name": "JinaReaderNode",
        },
    ],
    "Tools": [
        {
            "node_type_name": "SendEmailNode",
            "module": ".nodes.email.send_email",
            "class_name": "SendEmailNode",
        },
    ],
}

DEPRECATED_NODE_TYPES = [
    {
        "node_type_name": "StaticValueNode",
        "module": ".nodes.primitives.static_value",
        "class_name": "StaticValueNode",
    },
    {
        "node_type_name": "MCTSNode",
        "module": ".nodes.llm.mcts",
        "class_name": "MCTSNode",
    },
    {
        "node_type_name": "MixtureOfAgentsNode",
        "module": ".nodes.llm.mixture_of_agents",
        "class_name": "MixtureOfAgentsNode",
    },
    {
        "node_type_name": "SelfConsistencyNode",
        "module": ".nodes.llm.self_consistency",
        "class_name": "SelfConsistencyNode",
    },
    {
        "node_type_name": "TreeOfThoughtsNode",
        "module": ".nodes.llm.tree_of_thoughts",
        "class_name": "TreeOfThoughtsNode",
    },
    {
        "node_type_name": "StringOutputLLMNode",
        "module": ".nodes.llm.string_output_llm",
        "class_name": "StringOutputLLMNode",
    },
    {
        "node_type_name": "StructuredOutputNode",
        "module": ".nodes.llm.structured_output",
        "class_name": "StructuredOutputNode",
    },
    {
        "node_type_name": "AdvancedLLMNode",
        "module": ".nodes.llm.single_llm_call",
        "class_name": "SingleLLMCallNode",
    },
    {
        "node_type_name": "SubworkflowNode",
        "module": ".nodes.subworkflow.subworkflow_node",
        "class_name": "SubworkflowNode",
    },
    {
        "node_type_name": "BranchSolveMergeNode",
        "module": ".nodes.llm.generative.branch_solve_merge",
        "class_name": "BranchSolveMergeNode",
    },
]


def get_all_node_types() -> Dict[str, List[NodeTypeSchema]]:
    """
    Returns a dictionary of all available node types grouped by category.
    """
    node_type_groups: Dict[str, List[NodeTypeSchema]] = {}
    for group_name, node_types in SUPPORTED_NODE_TYPES.items():
        node_type_groups[group_name] = []
        for node_type_dict in node_types:
            node_type = NodeTypeSchema.model_validate(node_type_dict)
            node_type_groups[group_name].append(node_type)
    return node_type_groups


def is_valid_node_type(node_type_name: str) -> bool:
    """
    Checks if a node type is valid (supported, deprecated, or registered via decorator).
    """
    # Check configured nodes first
    for node_types in SUPPORTED_NODE_TYPES.values():
        for node_type in node_types:
            if node_type["node_type_name"] == node_type_name:
                return True

    for node_type in DEPRECATED_NODE_TYPES:
        if node_type["node_type_name"] == node_type_name:
            return True

    # Check registry for decorator-registered nodes
    registered_nodes = NodeRegistry.get_registered_nodes()
    for nodes in registered_nodes.values():
        for node in nodes:
            if node["node_type_name"] == node_type_name:
                return True

    return False

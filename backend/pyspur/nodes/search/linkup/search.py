import json
import logging
import os
from enum import Enum
from typing import List

from jinja2 import Template
from linkup import LinkupClient, LinkupSourcedAnswer
from pydantic import BaseModel, Field

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class LinkupDepth(str, Enum):
    FAST = "fast"
    STANDARD = "standard"
    DEEP = "deep"


class LinkupOutputType(str, Enum):
    SEARCH_RESULTS = "searchResults"
    SOURCED_ANSWER = "sourcedAnswer"


class LinkupSearchNodeInput(BaseNodeInput):
    """Input for the LinkupSearch node."""

    class Config:
        extra = "allow"


class LinkupSearchResult(BaseModel):
    title: str = Field(..., description="Title of the search result")
    url: str = Field(..., description="URL of the search result")
    content: str = Field("", description="Text content or snippet of the search result")


class LinkupSearchNodeOutput(BaseNodeOutput):
    answer: str = Field(
        "", description="Answer generated from the sources (sourcedAnswer output type only)"
    )
    results: List[LinkupSearchResult] = Field(
        ..., description="List of search results (or answer sources) from Linkup"
    )


SIMPLE_OUTPUT_SCHEMA = {
    "title": "LinkupSearchNodeOutput",
    "type": "object",
    "properties": {
        "answer": {
            "title": "Answer",
            "type": "string",
            "description": "Answer generated from the sources (sourcedAnswer output type only)",
        },
        "results": {
            "title": "Search Results",
            "type": "array",
            "description": "List of search results (or answer sources) from Linkup",
            "items": {"type": "object"},
        },
    },
    "required": ["results"],
}


class LinkupSearchNodeConfig(BaseNodeConfig):
    query_template: str = Field(
        "{{input_1}}",
        description="Template for the query string. Use {{variable}} syntax to reference inputs.",
    )
    depth: LinkupDepth = Field(
        LinkupDepth.STANDARD,
        description="'standard' for most queries, 'deep' for complex multi-step questions.",
    )
    output_type: LinkupOutputType = Field(
        LinkupOutputType.SEARCH_RESULTS,
        description="'searchResults' for raw results, 'sourcedAnswer' for an answer with sources.",
    )
    max_results: int = Field(10, description="Maximum number of search results to return.")
    include_domains: List[str] = Field(
        default=[], description="Only return results from these domains."
    )
    exclude_domains: List[str] = Field(
        default=[], description="Never return results from these domains."
    )
    has_fixed_output: bool = True

    output_json_schema: str = Field(
        default=json.dumps(SIMPLE_OUTPUT_SCHEMA),
        description="The JSON schema for the output of the node",
    )


class LinkupSearchNode(BaseNode):
    """Searches the web in real time with Linkup and returns citable sources."""

    name = "linkup_search_node"
    display_name = "LinkupSearch"
    logo = "/images/linkup.png"
    category = "Search"

    config_model = LinkupSearchNodeConfig
    input_model = LinkupSearchNodeInput
    output_model = LinkupSearchNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            api_key = os.getenv("LINKUP_API_KEY")

            if not api_key:
                raise ValueError("Linkup API key not found in environment variables")

            client = LinkupClient(api_key=api_key)

            raw_input_dict = input.model_dump()
            query = Template(self.config.query_template).render(**raw_input_dict)

            logging.info(f"Executing Linkup search with query: {query}")

            response = await client.async_search(
                query=query,
                depth=LinkupDepth(self.config.depth).value,
                output_type=LinkupOutputType(self.config.output_type).value,
                max_results=self.config.max_results,
                include_domains=self.config.include_domains or None,
                exclude_domains=self.config.exclude_domains or None,
            )

            if isinstance(response, LinkupSourcedAnswer):
                return LinkupSearchNodeOutput(
                    answer=response.answer,
                    results=[
                        LinkupSearchResult(
                            title=source.name, url=source.url, content=source.snippet
                        )
                        for source in response.sources
                    ],
                )

            results = [
                LinkupSearchResult(
                    title=result.name,
                    url=result.url,
                    content=getattr(result, "content", ""),
                )
                for result in response.results
            ]
            return LinkupSearchNodeOutput(results=results)

        except Exception as e:
            logging.error(f"Failed to perform Linkup search: {e}")
            raise e

import json
import logging
import os
from typing import List, Optional

from exa_py import Exa
from jinja2 import Template
from pydantic import BaseModel, Field

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class ExaSearchNodeInput(BaseNodeInput):
    """Input for the ExaSearch node."""

    # Input can come from various fields, we'll handle it in the run method
    # No explicit query field needed here since we'll use a template

    class Config:
        extra = "allow"


class ExaSearchResult(BaseModel):
    title: str = Field(..., description="Title of the search result")
    url: str = Field(..., description="URL of the search result")
    content: Optional[str] = Field(None, description="Text content if retrieved")
    score: Optional[float] = Field(None, description="Relevance score of the result")
    published_date: Optional[str] = Field(None, description="Publication date if available")
    author: Optional[str] = Field(None, description="Author if available")


class ExaSearchNodeOutput(BaseNodeOutput):
    results: List[ExaSearchResult] = Field(..., description="List of search results from Exa")


# Define a simple schema without complex nested structures
SIMPLE_OUTPUT_SCHEMA = {
    "title": "ExaSearchNodeOutput",
    "type": "object",
    "properties": {
        "results": {
            "title": "Search Results",
            "type": "array",
            "description": "List of search results from Exa",
            "items": {"type": "object"},
        }
    },
    "required": ["results"],
}


class ExaSearchNodeConfig(BaseNodeConfig):
    max_results: int = Field(
        10, description="Maximum number of search results to return (max 100)."
    )
    include_content: bool = Field(
        True, description="When True, fetch and include text content of search results."
    )
    max_characters: int = Field(
        1000,
        description="Maximum characters to fetch for each result's content (when include_content is True).",
    )
    query_template: str = Field(
        "{{input_1}}",
        description="Template for the query string. Use {{variable}} syntax to reference input variables.",
    )
    has_fixed_output: bool = True

    # Use a simple predefined schema
    output_json_schema: str = Field(
        default=json.dumps(SIMPLE_OUTPUT_SCHEMA),
        description="The JSON schema for the output of the node",
    )


class ExaSearchNode(BaseNode):
    name = "exa_search_node"
    display_name = "ExaSearch"
    logo = "/images/exa.png"  # Placeholder, you may need to add an Exa logo
    category = "Search"

    config_model = ExaSearchNodeConfig
    input_model = ExaSearchNodeInput
    output_model = ExaSearchNodeOutput

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
            api_key = os.getenv("EXA_API_KEY")

            if not api_key:
                raise ValueError("Exa API key not found in environment variables")

            # Initialize Exa client
            exa = Exa(api_key=api_key)

            # Extract query from input using the template
            # This approach is more flexible and handles various input field names
            raw_input_dict = input.model_dump()
            query = Template(self.config.query_template).render(**raw_input_dict)

            logging.info(f"Executing Exa search with query: {query}")

            # Configure content options based on config
            content_options = None
            if self.config.include_content:
                content_options = {"max_characters": self.config.max_characters}

            # Execute search
            search_results = exa.search_and_contents(
                query,
                num_results=min(self.config.max_results, 100),  # Cap at 100 results
                text=content_options if self.config.include_content else None,
            )

            # Transform results to our model format
            results = []
            for result in search_results.results:
                # Extract metadata and content with safer attribute access
                result_data = ExaSearchResult(
                    title=getattr(result, "title", "Untitled"),
                    url=getattr(result, "url", ""),
                    content=getattr(result, "text", None),
                    score=getattr(result, "score", None),
                    published_date=getattr(result, "published_date", None),
                    author=getattr(result, "author", None),
                )
                results.append(result_data)

            return ExaSearchNodeOutput(results=results)

        except Exception as e:
            logging.error(f"Failed to perform Exa search: {e}")
            raise e

import json
import logging
from typing import Any, Optional, Type

from pydantic import BaseModel, Field  # type: ignore

from firecrawl import FirecrawlApp  # type: ignore

from ...base import Tool
from ...utils.template_utils import render_template_or_get_first_string


class FirecrawlCrawlNodeOutput(BaseModel):
    """Output for the FirecrawlCrawl node"""

    crawl_result: str = Field(..., description="The crawled data in markdown or structured format.")


class FirecrawlCrawlNode(Tool):
    """Node for crawling a URL and returning the content in markdown or structured format."""

    name: str = "firecrawl_crawl_node"
    output_model: Type[BaseModel] = FirecrawlCrawlNodeOutput

    # Configuration fields moved from FirecrawlCrawlNodeConfig
    url_template: str = Field(
        "",
        description="The URL to crawl and convert into clean markdown or structured data.",
    )
    limit: Optional[int] = Field(None, description="The maximum number of pages to crawl.")
    has_fixed_output: bool = True

    def model_post_init(self, _: Any) -> None:
        """Initialize after Pydantic model initialization."""
        super().model_post_init(_)
        # Set display name and logo
        self.display_name = "FirecrawlCrawl"
        self._logo = "/images/firecrawl.png"

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            # Grab the entire dictionary from the input
            raw_input_dict = input.model_dump()

            # Render url_template
            url_template = render_template_or_get_first_string(
                self.url_template, raw_input_dict, self.name
            )

            app = FirecrawlApp()  # type: ignore
            crawl_result = app.crawl_url(  # type: ignore
                url_template,
                params={
                    "limit": self.limit,
                    "scrapeOptions": {"formats": ["markdown", "html"]},
                },
            )
            return FirecrawlCrawlNodeOutput(crawl_result=json.dumps(crawl_result))
        except Exception as e:
            logging.error(f"Failed to crawl URL: {e}")
            return FirecrawlCrawlNodeOutput(crawl_result="")

import asyncio
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
        """Run the FirecrawlCrawl node."""
        try:
            # Grab the entire dictionary from the input
            raw_input_dict = input.model_dump()

            # Render url_template
            url_template = render_template_or_get_first_string(
                self.url_template, raw_input_dict, self.name
            )

            app = FirecrawlApp()  # type: ignore

            # Start the asynchronous crawl
            crawl_obj = app.async_crawl_url(  # type: ignore
                url_template,
                params={
                    "limit": self.limit,
                    "scrapeOptions": {"formats": ["markdown", "html"]},
                },
            )

            # Get the crawl ID from the response
            crawl_id = crawl_obj.get("id")
            if not crawl_id:
                raise ValueError("No crawl ID received from async crawl request")

            # Poll for completion with exponential backoff
            max_attempts = 30  # Maximum number of attempts
            base_delay = 2  # Base delay in seconds

            for attempt in range(max_attempts):
                # Check the crawl status
                status_response = app.check_crawl_status(crawl_id)  # type: ignore

                if status_response.get("status") == "completed":
                    crawl_result = status_response.get("data", {})
                    return FirecrawlCrawlNodeOutput(crawl_result=json.dumps(crawl_result))

                if status_response.get("status") == "failed":
                    raise ValueError(
                        f"Crawl failed: {status_response.get('error', 'Unknown error')}"
                    )

                # Calculate delay with exponential backoff (2^attempt seconds)
                delay = min(base_delay * (2**attempt), 60)  # Cap at 60 seconds
                await asyncio.sleep(delay)

            raise TimeoutError("Crawl did not complete within the maximum allowed time")

        except Exception as e:
            logging.error(f"Failed to crawl URL: {e}")
            return FirecrawlCrawlNodeOutput(crawl_result="")

import json
import logging
import asyncio
from pydantic import BaseModel, Field  # type: ignore
from ...base import (
    BaseNode,
    BaseNodeConfig,
    BaseNodeInput,
    BaseNodeOutput,
)
from firecrawl import FirecrawlApp  # type: ignore
from typing import Optional
from ...utils.template_utils import render_template_or_get_first_string


class FirecrawlCrawlNodeInput(BaseNodeInput):
    """Input for the FirecrawlCrawl node"""

    class Config:
        extra = "allow"


class FirecrawlCrawlNodeOutput(BaseNodeOutput):
    crawl_result: str = Field(
        ..., description="The crawled data in markdown or structured format."
    )


class FirecrawlCrawlNodeConfig(BaseNodeConfig):
    url_template: str = Field(
        "",
        description="The URL to crawl and convert into clean markdown or structured data.",
    )
    limit: Optional[int] = Field(
        None, description="The maximum number of pages to crawl."
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(FirecrawlCrawlNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class FirecrawlCrawlNode(BaseNode):
    name = "firecrawl_crawl_node"
    display_name = "FirecrawlCrawl"
    logo = "/images/firecrawl.png"
    category = "Firecrawl"

    config_model = FirecrawlCrawlNodeConfig
    input_model = FirecrawlCrawlNodeInput
    output_model = FirecrawlCrawlNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            # Grab the entire dictionary from the input
            raw_input_dict = input.model_dump()

            # Render url_template
            url_template = render_template_or_get_first_string(
                self.config.url_template, raw_input_dict, self.name
            )

            app = FirecrawlApp()  # type: ignore

            # Start the asynchronous crawl
            crawl_obj = app.async_crawl_url(  # type: ignore
                url_template,
                params={
                    "limit": self.config.limit,
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
                    return FirecrawlCrawlNodeOutput(
                        crawl_result=json.dumps(crawl_result)
                    )

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

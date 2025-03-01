import logging
from typing import Any, Type

from pydantic import BaseModel, Field  # type: ignore

from firecrawl import FirecrawlApp  # type: ignore

from ...base import Tool
from ...registry import NodeRegistry
from ...utils.template_utils import render_template_or_get_first_string


class FirecrawlScrapeNodeOutput(BaseModel):
    """Output for the FirecrawlScrape node"""

    markdown: str = Field(..., description="The scraped data in markdown format.")


@NodeRegistry.register(
    category="Integrations",
    display_name="Firecrawl Scrape",
    logo="/images/firecrawl.png",
    subcategory="Web Scraping",
    position="after:FirecrawlCrawlNode",
)
class FirecrawlScrapeNode(Tool):
    """Node for scraping a URL and returning the content in markdown format."""

    name: str = "firecrawl_scrape_node"
    output_model: Type[BaseModel] = FirecrawlScrapeNodeOutput

    # Configuration fields moved from FirecrawlScrapeNodeConfig
    url_template: str = Field(
        "",
        description="The URL to scrape and convert into clean markdown or structured data.",
    )
    has_fixed_output: bool = True

    def model_post_init(self, _: Any) -> None:
        """Initialize after Pydantic model initialization."""
        super().model_post_init(_)
        # Set display name
        self.display_name = "Firecrawl Scrape"

    async def run(self, input: BaseModel) -> BaseModel:
        """Scrapes a URL and returns the content in markdown or structured format.
        """
        try:
            # Grab the entire dictionary from the input
            raw_input_dict = input.model_dump()

            # Render url_template
            url_template = render_template_or_get_first_string(
                self.url_template, raw_input_dict, self.name
            )

            app = FirecrawlApp()  # type: ignore
            scrape_result = app.scrape_url(  # type: ignore
                url_template,
                params={
                    "formats": ["markdown"],
                },
            )
            return FirecrawlScrapeNodeOutput(markdown=scrape_result["markdown"])
        except Exception as e:
            logging.error(f"Failed to scrape URL: {e}")
            return FirecrawlScrapeNodeOutput(markdown="")

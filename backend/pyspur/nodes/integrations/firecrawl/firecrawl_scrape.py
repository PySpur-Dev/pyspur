import json
import logging

from pydantic import BaseModel, Field  # type: ignore

from firecrawl import FirecrawlApp  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ...registry import NodeRegistry
from ...utils.template_utils import render_template_or_get_first_string


class FirecrawlScrapeNodeInput(BaseNodeInput):
    """Input for the FirecrawlScrape node"""

    class Config:
        extra = "allow"


class FirecrawlScrapeNodeOutput(BaseNodeOutput):
    markdown: str = Field(..., description="The scraped data in markdown format.")


class FirecrawlScrapeNodeConfig(BaseNodeConfig):
    url_template: str = Field(
        "",
        description="The URL to scrape and convert into clean markdown or structured data.",
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(FirecrawlScrapeNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


@NodeRegistry.register(
    category="Integrations",
    display_name="Firecrawl Scrape",
    logo="/images/firecrawl.png",
    subcategory="Web Scraping",
    position="after:FirecrawlCrawlNode",
)
class FirecrawlScrapeNode(BaseNode):
    name = "firecrawl_scrape_node"
    config_model = FirecrawlScrapeNodeConfig
    input_model = FirecrawlScrapeNodeInput
    output_model = FirecrawlScrapeNodeOutput
    category = "Firecrawl"  # This will be used by the frontend for subcategory grouping

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Scrapes a URL and returns the content in markdown or structured format.
        """
        try:
            # Grab the entire dictionary from the input
            raw_input_dict = input.model_dump()

            # Render url_template
            url_template = render_template_or_get_first_string(
                self.config.url_template, raw_input_dict, self.name
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

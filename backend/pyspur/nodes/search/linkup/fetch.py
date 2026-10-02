import json
import logging
import os

from linkup import LinkupClient
from pydantic import BaseModel, Field

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ...utils.template_utils import render_template_or_get_first_string


class LinkupFetchNodeInput(BaseNodeInput):
    """Input for the LinkupFetch node."""

    class Config:
        extra = "allow"


class LinkupFetchNodeOutput(BaseNodeOutput):
    markdown: str = Field(..., description="The content of the fetched page in markdown format.")


class LinkupFetchNodeConfig(BaseNodeConfig):
    url_template: str = Field(
        "",
        description="The URL to fetch and convert into clean markdown.",
    )
    render_js: bool = Field(
        False, description="Render JavaScript on the page before extracting its content."
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(LinkupFetchNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class LinkupFetchNode(BaseNode):
    """Fetches a URL with Linkup and returns its content as markdown."""

    name = "linkup_fetch_node"
    display_name = "LinkupFetch"
    logo = "/images/linkup.png"
    category = "Search"

    config_model = LinkupFetchNodeConfig
    input_model = LinkupFetchNodeInput
    output_model = LinkupFetchNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            api_key = os.getenv("LINKUP_API_KEY")

            if not api_key:
                raise ValueError("Linkup API key not found in environment variables")

            client = LinkupClient(api_key=api_key)

            raw_input_dict = input.model_dump()
            url = render_template_or_get_first_string(
                self.config.url_template, raw_input_dict, self.name
            )

            logging.info(f"Executing Linkup fetch for URL: {url}")

            response = await client.async_fetch(url=url, render_js=self.config.render_js)
            return LinkupFetchNodeOutput(markdown=response.markdown)

        except Exception as e:
            logging.error(f"Failed to perform Linkup fetch: {e}")
            raise e

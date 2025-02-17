import json
import logging

import httpx
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ...utils.template_utils import render_template_or_get_first_string


class JinaReaderNodeInput(BaseNodeInput):
    """Input for the JinaReader node"""

    class Config:
        extra = "allow"


class JinaReaderNodeOutput(BaseNodeOutput):
    title: str = Field("", description="The title of scraped page")
    content: str = Field("", description="The content of the scraped page in markdown format")


class JinaReaderNodeConfig(BaseNodeConfig):
    url_template: str = Field(
        "https://r.jina.ai/{url}",
        description="The URL to crawl and convert into clean markdown.",
    )
    use_readerlm_v2: bool = Field(True, description="Use the Reader LM v2 model to process the URL")
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(JinaReaderNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class JinaReaderNode(BaseNode):
    name = "jina_reader_node"
    display_name = "Reader"
    logo = "/images/jina.png"
    category = "Jina.AI"

    config_model = JinaReaderNodeConfig
    input_model = JinaReaderNodeInput
    output_model = JinaReaderNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        try:
            headers = {
                "Accept": "application/json",
            }
            if self.config.use_readerlm_v2:
                headers["X-Respond-With"] = "readerlm-v2"

            # Grab the entire dictionary from the input
            raw_input_dict = input.model_dump()

            # Render url_template
            reader_url = render_template_or_get_first_string(
                self.config.url_template, raw_input_dict, self.name
            )

            async with httpx.AsyncClient() as client:
                response = await client.get(reader_url, headers=headers, timeout=None)
                logging.debug("Fetched from Jina: {text}".format(text=response.text))
                output = JinaReaderNodeOutput.model_validate(response.json()["data"])
                if output.content.startswith("```markdown"):
                    # remove the backticks/code format indicators in the output
                    output.content = output.content[12:-4]
                return output
        except Exception as e:
            logging.error(f"Failed to convert URL: {e}")
            return JinaReaderNodeOutput(title="", content="")

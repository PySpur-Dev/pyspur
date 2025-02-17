import json
import logging
import os

import requests
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ...utils.template_utils import render_template_or_get_first_string


class MathpixPdfToLatexNodeInput(BaseNodeInput):
    """Input for the MathpixPdfToLatex node"""

    class Config:
        extra = "allow"


class MathpixPdfToLatexNodeOutput(BaseNodeOutput):
    latex_result: str = Field(
        ...,
        description="The converted LaTeX content or conversion status JSON.",
    )


class MathpixPdfToLatexNodeConfig(BaseNodeConfig):
    url_template: str = Field("", description="The URL of the PDF to convert to LaTeX.")
    app_id: str = Field(
        default="",
        description="Mathpix API app_id. Can be set via environment variable MATHPIX_APP_ID.",
    )
    app_key: str = Field(
        default="",
        description="Mathpix API app_key. Can be set via environment variable MATHPIX_APP_KEY.",
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(MathpixPdfToLatexNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class MathpixPdfToLatexNode(BaseNode):
    name = "mathpix_pdf_to_latex_node"
    display_name = "Mathpix PDF to LaTeX"
    logo = "/images/mathpix.png"
    category = "Mathpix"

    config_model = MathpixPdfToLatexNodeConfig
    input_model = MathpixPdfToLatexNodeInput
    output_model = MathpixPdfToLatexNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Converts a PDF to LaTeX using the Mathpix API.
        """
        try:
            # Get input dictionary
            raw_input_dict = input.model_dump()

            # Render URL template
            url = render_template_or_get_first_string(
                self.config.url_template, raw_input_dict, self.name
            )

            # Get credentials from config or environment
            app_id = self.config.app_id or os.environ.get("MATHPIX_APP_ID")
            app_key = self.config.app_key or os.environ.get("MATHPIX_APP_KEY")

            if not app_id or not app_key:
                raise ValueError("Mathpix API credentials not provided")

            # Make API request
            response = requests.post(
                "https://api.mathpix.com/v3/pdf",
                json={"url": url, "conversion_formats": {"tex.zip": True}},
                headers={
                    "app_id": app_id,
                    "app_key": app_key,
                    "Content-type": "application/json",
                },
            )

            # Return the conversion result
            return MathpixPdfToLatexNodeOutput(latex_result=json.dumps(response.json(), indent=2))

        except Exception as e:
            logging.error(f"Failed to convert PDF to LaTeX: {e}")
            return MathpixPdfToLatexNodeOutput(latex_result=str(e))

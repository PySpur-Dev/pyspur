import json

from pydantic import BaseModel, Field

from ....integrations.google.client import GoogleSheetsClient
from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class GoogleSheetsReadNodeInput(BaseNodeInput):
    """Input for the GoogleSheetsRead node"""

    class Config:
        extra = "allow"


class GoogleSheetsReadNodeOutput(BaseNodeOutput):
    data: str = Field(..., description="The data from the Google Sheet.")


class GoogleSheetsReadNodeConfig(BaseNodeConfig):
    spreadsheet_id: str = Field("", description="The ID of the Google Sheet to read from.")
    range: str = Field(
        "",
        description="The range of cells to read from (e.g. 'Sheet1!A1:B10').",
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(GoogleSheetsReadNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class GoogleSheetsReadNode(BaseNode):
    """
    Node that reads data from a specified range in a Google Sheet.
    """

    name = "google_sheets_read_node"
    display_name = "GoogleSheetsRead"
    logo = "/images/google.png"
    category = "Google"

    config_model = GoogleSheetsReadNodeConfig
    input_model = GoogleSheetsReadNodeInput
    output_model = GoogleSheetsReadNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Runs the node, uses GoogleSheetsClient to read from the specified
        sheet and range, and returns the data in the output model.
        """
        sheets_client = GoogleSheetsClient()

        try:
            success, result = sheets_client.read_sheet(
                spreadsheet_id=self.config.spreadsheet_id,
                range_name=self.config.range,
            )

            if success:
                return GoogleSheetsReadNodeOutput(data=result)
            else:
                return GoogleSheetsReadNodeOutput(data=f"Error: {result}")

        except Exception as e:
            return GoogleSheetsReadNodeOutput(data=f"Exception occurred: {str(e)}")

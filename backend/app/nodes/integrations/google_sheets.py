import os
import json
from enum import Enum
from typing import Optional, List, Any
from pydantic import BaseModel
from ..static_schema import StaticSchemaNode
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

class GoogleSheetsOperation(str, Enum):
    READ_SHEET = "read_sheet"
    READ_RANGE = "read_range"
    WRITE_RANGE = "write_range"
    APPEND_ROWS = "append_rows"
    CREATE_SHEET = "create_sheet"

class GoogleSheetsConfig(BaseModel):
    operation: GoogleSheetsOperation
    spreadsheet_id: str
    sheet_name: Optional[str] = None
    range: Optional[str] = None
    create_if_not_exists: bool = False

class GoogleSheetsInput(BaseModel):
    data: Optional[List[List[Any]]] = None  # For write/append operations
    sheet_title: Optional[str] = None  # For create operation
    batch_ranges: Optional[List[str]] = None  # For batch operations

class GoogleSheetsOutput(BaseModel):
    data: Optional[List[List[Any]]] = None  # For read operations
    spreadsheet_id: str
    sheet_id: Optional[str] = None
    success: bool
    message: str

class GoogleSheetsNode(StaticSchemaNode):
    name = "google_sheets"
    config_model = GoogleSheetsConfig
    input_model = GoogleSheetsInput
    output_model = GoogleSheetsOutput

    def setup(self) -> None:
        # Ensure credentials are available
        creds = self._get_credentials()
        self.service = build('sheets', 'v4', credentials=creds)

    async def run(self, input_data: GoogleSheetsInput) -> GoogleSheetsOutput:
        try:
            if self.config.operation == GoogleSheetsOperation.READ_SHEET:
                return await self._read_sheet(input_data)
            elif self.config.operation == GoogleSheetsOperation.READ_RANGE:
                return await self._read_range(input_data)
            elif self.config.operation == GoogleSheetsOperation.WRITE_RANGE:
                return await self._write_range(input_data)
            elif self.config.operation == GoogleSheetsOperation.APPEND_ROWS:
                return await self._append_rows(input_data)
            elif self.config.operation == GoogleSheetsOperation.CREATE_SHEET:
                return await self._create_sheet(input_data)
            else:
                return GoogleSheetsOutput(
                    success=False,
                    message=f"Unsupported operation: {self.config.operation}",
                    spreadsheet_id=self.config.spreadsheet_id
                )
        except HttpError as error:
            return GoogleSheetsOutput(
                success=False,
                message=f"Error: {str(error)}",
                spreadsheet_id=self.config.spreadsheet_id
            )

    async def _read_sheet(self, input_data: GoogleSheetsInput) -> GoogleSheetsOutput:
        result = self.service.spreadsheets().values().get(
            spreadsheetId=self.config.spreadsheet_id,
            range=self.config.sheet_name
        ).execute()
        return GoogleSheetsOutput(
            success=True,
            data=result.get('values', []),
            spreadsheet_id=self.config.spreadsheet_id,
            message="Sheet read successfully"
        )

    async def _read_range(self, input_data: GoogleSheetsInput) -> GoogleSheetsOutput:
        ranges = input_data.batch_ranges or [self.config.range]
        if not ranges:
            return GoogleSheetsOutput(
                success=False,
                message="No range specified",
                spreadsheet_id=self.config.spreadsheet_id
            )

        batch_result = self.service.spreadsheets().values().batchGet(
            spreadsheetId=self.config.spreadsheet_id,
            ranges=ranges
        ).execute()

        values = []
        for value_range in batch_result.get('valueRanges', []):
            values.extend(value_range.get('values', []))

        return GoogleSheetsOutput(
            success=True,
            data=values,
            spreadsheet_id=self.config.spreadsheet_id,
            message=f"Successfully read {len(ranges)} range(s)"
        )

    async def _write_range(self, input_data: GoogleSheetsInput) -> GoogleSheetsOutput:
        if not input_data.data:
            return GoogleSheetsOutput(
                success=False,
                message="No data provided for writing",
                spreadsheet_id=self.config.spreadsheet_id
            )

        body = {
            'values': input_data.data
        }

        result = self.service.spreadsheets().values().update(
            spreadsheetId=self.config.spreadsheet_id,
            range=self.config.range,
            valueInputOption='USER_ENTERED',
            body=body
        ).execute()

        return GoogleSheetsOutput(
            success=True,
            spreadsheet_id=self.config.spreadsheet_id,
            message=f"Updated {result.get('updatedCells')} cells"
        )

    async def _append_rows(self, input_data: GoogleSheetsInput) -> GoogleSheetsOutput:
        if not input_data.data:
            return GoogleSheetsOutput(
                success=False,
                message="No data provided for appending",
                spreadsheet_id=self.config.spreadsheet_id
            )

        body = {
            'values': input_data.data
        }

        result = self.service.spreadsheets().values().append(
            spreadsheetId=self.config.spreadsheet_id,
            range=self.config.sheet_name,
            valueInputOption='USER_ENTERED',
            insertDataOption='INSERT_ROWS',
            body=body
        ).execute()

        return GoogleSheetsOutput(
            success=True,
            spreadsheet_id=self.config.spreadsheet_id,
            message=f"Appended {len(input_data.data)} rows"
        )

    async def _create_sheet(self, input_data: GoogleSheetsInput) -> GoogleSheetsOutput:
        if not input_data.sheet_title:
            return GoogleSheetsOutput(
                success=False,
                message="No sheet title provided",
                spreadsheet_id=self.config.spreadsheet_id
            )

        body = {
            'requests': [{
                'addSheet': {
                    'properties': {
                        'title': input_data.sheet_title
                    }
                }
            }]
        }

        try:
            result = self.service.spreadsheets().batchUpdate(
                spreadsheetId=self.config.spreadsheet_id,
                body=body
            ).execute()

            new_sheet = result['replies'][0]['addSheet']['properties']
            return GoogleSheetsOutput(
                success=True,
                spreadsheet_id=self.config.spreadsheet_id,
                sheet_id=str(new_sheet['sheetId']),
                message=f"Created new sheet: {new_sheet['title']}"
            )
        except HttpError as error:
            if 'already exists' in str(error):
                return GoogleSheetsOutput(
                    success=False,
                    spreadsheet_id=self.config.spreadsheet_id,
                    message=f"Sheet '{input_data.sheet_title}' already exists"
                )
            raise

    def _get_credentials(self) -> Credentials:
        creds_json = os.getenv('GOOGLE_SHEETS_CREDENTIALS')
        if not creds_json:
            raise ValueError("Google Sheets credentials not found in environment")
        return Credentials.from_authorized_user_info(json.loads(creds_json))

import json
from pathlib import Path
from typing import Tuple

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build  # type: ignore
from googleapiclient.errors import HttpError  # type: ignore

# Retrieve the current directory using pathlib for better path handling.
BASE_DIR = Path(__file__).resolve().parent

# Default file paths for credentials and tokens.
TOKEN_FILE = BASE_DIR / "token.json"


class GoogleSheetsClient:
    token_path = Path(TOKEN_FILE)

    def get_credentials(self) -> Credentials:
        if self.token_path.exists():
            with self.token_path.open("r") as token_file:
                token_data = json.load(token_file)
                access_token = token_data.get("access_token")
                if not access_token:
                    raise RuntimeError("No access token found in token file.")
        else:
            raise FileNotFoundError("Token file does not exist.")

        # Load existing credentials from token file if it exists.
        creds = Credentials(token=access_token)  # type: ignore
        return creds

    def read_sheet(self, spreadsheet_id: str, range_name: str) -> Tuple[bool, str]:
        """
        Fetches data from the specified spreadsheet range.

        :param spreadsheet_id: The unique ID of the Google Spreadsheet (found in its URL).
        :param range_name: The A1 notation specifying which cells to retrieve (e.g., "Sheet1!A1:C10").
        :return: A tuple (success, data_or_error).
                 success = True if data was retrieved successfully, else False.
                 data_or_error = stringified list of values or an error message.
        """
        try:
            creds = self.get_credentials()
            service = build("sheets", "v4", credentials=creds)  # type: ignore
            sheet = service.spreadsheets()  # type: ignore

            result = (
                sheet.values()
                .get(  # type: ignore
                    spreadsheetId=spreadsheet_id, range=range_name
                )
                .execute()
            )

            values = result.get("values", [])  # type: ignore
            if not values:
                return False, "No data found."
            return True, str(values)  # type: ignore

        except HttpError as http_err:
            return False, f"HTTP Error: {http_err}"
        except Exception as e:
            return False, f"An error occurred: {e}"


# Example usage (run as script):
if __name__ == "__main__":
    SAMPLE_SPREADSHEET_ID = "REPLACE_WITH_YOUR_SPREADSHEET_ID"
    SAMPLE_RANGE_NAME = "Sheet1!A1:C6"

    client = GoogleSheetsClient()
    success, data = client.read_sheet(SAMPLE_SPREADSHEET_ID, SAMPLE_RANGE_NAME)
    if success:
        print("Data from sheet:", data)
    else:
        print("Error:", data)

import os

from dotenv import load_dotenv
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN")
SLACK_USER_TOKEN = os.getenv("SLACK_USER_TOKEN")


class SlackClient:
    def __init__(self):
        self.bot_token = SLACK_BOT_TOKEN
        self.user_token = SLACK_USER_TOKEN

        self.bot_client = WebClient(token=self.bot_token)
        self.user_client = WebClient(token=self.user_token)

    def send_message_as_bot(self, channel: str, text: str) -> tuple[bool, str]:
        """
        Sends a message to the specified Slack channel.

        Returns:
            bool: True if successful, False otherwise.
            str: The status message.
        """

        if not self.bot_token:
            raise ValueError("Slack bot token not found in environment variables.")

        try:
            response = self.bot_client.chat_postMessage(channel=channel, text=text)  # type: ignore
            return response.get("ok", False), "success"
        except SlackApiError as e:
            print(f"Error sending message: {e}")
            return False, str(e)

    def send_message_as_user(self, channel: str, text: str) -> tuple[bool, str]:
        """
        Sends a message to the specified Slack channel as a user.

        Returns:
            bool: True if successful, False otherwise.
            str: The status message.
        """

        if not self.user_token:
            raise ValueError("Slack user token not found in environment variables.")

        try:
            response = self.user_client.chat_postMessage(channel=channel, text=text)  # type: ignore
            return response.get("ok", False), "success"
        except SlackApiError as e:
            print(f"Error sending message: {e}")
            return False, str(e)

    def send_message(self, channel: str, text: str, mode: str = "bot") -> tuple[bool, str]:
        """
        Sends a message to the specified Slack channel.

        Args:
            channel (str): The channel ID to send the message to.
            text (str): The message to send to the Slack channel.
            mode (str): The mode to send the message in. Can be 'bot' or 'user'.

        Returns:
            bool: True if successful, False otherwise.
            str: The status message.
        """
        if mode == "bot":
            return self.send_message_as_bot(channel, text)
        elif mode == "user":
            return self.send_message_as_user(channel, text)
        else:
            raise ValueError(f"Invalid mode: {mode}")


if __name__ == "__main__":
    client = SlackClient()
    client.send_message_as_bot(channel="#integrations", text="Hello from the SlackClient!")
    client.send_message_as_user(channel="#integrations", text="Hello from the Slack Client!")
    client.send_message(channel="#integrations", text="Hello from the Slack Client!", mode="bot")
    client.send_message(
        channel="#integrations",
        text="Hello from the Slack Client!",
        mode="user",
    )

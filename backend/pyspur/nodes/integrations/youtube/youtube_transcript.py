import json
import logging

from phi.tools.youtube_tools import YouTubeTools
from pydantic import BaseModel, Field

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ...utils.template_utils import render_template_or_get_first_string


class YouTubeTranscriptNodeInput(BaseNodeInput):
    """Input for the YouTubeTranscript node"""

    class Config:
        extra = "allow"


class YouTubeTranscriptNodeOutput(BaseNodeOutput):
    transcript: str = Field(..., description="The transcript of the YouTube video.")


class YouTubeTranscriptNodeConfig(BaseNodeConfig):
    video_url_template: str = Field(
        "",
        description="The YouTube video url template to fetch the transcript for.",
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(YouTubeTranscriptNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node",
    )


class YouTubeTranscriptNode(BaseNode):
    name = "youtube_transcript_node"
    display_name = "YouTubeTranscript"
    logo = "/images/youtube.png"
    category = "YouTube"

    config_model = YouTubeTranscriptNodeConfig
    input_model = YouTubeTranscriptNodeInput
    output_model = YouTubeTranscriptNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Fetches the transcript for a given YouTube video ID and languages.
        """
        try:
            # Grab the entire dictionary from the input
            raw_input_dict = input.model_dump()

            # Render video_url_template
            video_url = render_template_or_get_first_string(
                self.config.video_url_template, raw_input_dict, self.name
            )

            yt = YouTubeTools()
            transcript: str = yt.get_youtube_video_captions(url=video_url)
            return YouTubeTranscriptNodeOutput(transcript=transcript)
        except Exception as e:
            logging.error(f"Failed to get transcript: {e}")
            return YouTubeTranscriptNodeOutput(transcript="")

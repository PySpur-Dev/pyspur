import json
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from ..base import BaseNode, VisualTag
from .llm_utils import LLMModels, ModelInfo, create_messages, generate_text
from .string_output_llm import ModelInfo


class StructuredOutputNodeConfig(BaseModel):
    llm_info: ModelInfo = Field(
        ModelInfo(model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7),
        description="The default LLM model to use",
    )
    system_message: str = Field(
        "You are a helpful assistant.", description="The system message for the LLM"
    )
    user_message: str = Field(
        "What would you like to ask?", description="The user message for the LLM"
    )
    output_schema: Dict[str, str] = {"response": "str"}
    few_shot_examples: Optional[List[Dict[str, str]]] = None


class StructuredOutputNodeInput(BaseModel):
    user_message: str


class StructuredOutputNodeOutput(BaseModel):
    pass


class StructuredOutputNode(BaseNode):
    """
    Node type for calling an LLM with structured output.
    """

    name = "structured_output_llm_node"
    config_model = StructuredOutputNodeConfig
    input_model = StructuredOutputNodeInput
    output_model = StructuredOutputNodeOutput
    visual_tag = VisualTag(acronym="SON", color="#D1FFC1")  # Added visual tag

    def setup(self) -> None:
        self.input_model = StructuredOutputNodeInput
        self.output_model = self.get_model_for_schema_dict(
            self.config.output_schema, "StructuredOutputNodeOutput"
        )

    async def run(self, input_data: StructuredOutputNodeInput) -> BaseModel:
        system_message = self.config.system_message
        user_message = self.config.user_message
        output_schema = self.config.output_schema
        system_message += (
            f"\nMake sure the output follows this JSON schema: {output_schema}"
        )
        messages = create_messages(
            system_message=system_message,
            user_message=user_message,
            few_shot_examples=self.config.few_shot_examples,
        )
        assistant_message = await generate_text(
            messages=messages,
            model_name=self.config.llm_info.name,
            temperature=self.config.llm_info.temperature,
            json_mode=True,
        )
        assistant_message = json.loads(assistant_message)
        assistant_message = self.output_model.model_validate(assistant_message)

        return assistant_message


if __name__ == "__main__":

    async def test_llm_nodes():
        structured_output_llm_node = StructuredOutputNode(
            config=StructuredOutputNodeConfig(
                llm_info=ModelInfo(
                    model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7
                ),
                system_message="This is a test prompt.",
                user_message="This is a test message.",
                output_schema={"response": "str"},
            )
        )
        structured_input = StructuredOutputNodeInput(
            user_message="This is a test message."
        )
        structured_output = await structured_output_llm_node(structured_input)
        print(structured_output)
        print("-" * 50)

    import asyncio

    asyncio.run(test_llm_nodes())

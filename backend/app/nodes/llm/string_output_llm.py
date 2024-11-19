from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from ..base import BaseNode, VisualTag
from .llm_utils import LLMModels, ModelInfo, create_messages, generate_text


class StringOutputLLMNodeConfig(BaseModel):
    llm_info: ModelInfo = Field(
        ModelInfo(model=LLMModels.GPT_4O_MINI, max_tokens=16384, temperature=0.7),
        description="The default LLM model to use"
    )
    system_message: str = Field(
        "You are a helpful assistant.", description="The system message for the LLM"
    )
    user_message: str = Field(
        "What would you like to ask?", description="The user message for the LLM"
    )
    json_mode: bool = Field(False, description="Whether to use JSON mode for the LLM")
    few_shot_examples: Optional[List[Dict[str, str]]] = None


class StringOutputLLMNodeInput(BaseModel):
    user_message: str


class StringOutputLLMNodeOutput(BaseModel):
    assistant_message: str


class StringOutputLLMNode(BaseNode):
    """
    Basic node type for calling an LLM.
    """

    name = "string_output_llm_node"
    config_model = StringOutputLLMNodeConfig
    input_model = StringOutputLLMNodeInput
    output_model = StringOutputLLMNodeOutput
    visual_tag = VisualTag(acronym="SOLN", color="#C1E1FF")

    def setup(self) -> None:
        pass

    async def run(
        self, input_data: StringOutputLLMNodeInput
    ) -> StringOutputLLMNodeOutput:
        system_message = self.config.system_message
        user_message = self.config.user_message
        messages = create_messages(
            system_message=system_message,
            user_message=user_message,
            few_shot_examples=self.config.few_shot_examples,  # Pass examples here
        )
        assistant_message = await generate_text(
            messages=messages,
            model_name=self.config.llm_name.name,
            temperature=self.config.temperature,
            json_mode=self.config.json_mode,
        )
        return StringOutputLLMNodeOutput(assistant_message=assistant_message)


if __name__ == "__main__":

    async def test_llm_nodes():
        string_output_llm_node = StringOutputLLMNode(
            config=StringOutputLLMNodeConfig(
                llm_info=ModelInfo(model=LLMModels.GPT_4O_MINI, max_tokens=16384, temperature=0.7),
                system_message="This is a test prompt.",
                user_message="This is a test message.",
                json_mode=False,
            )
        )
        basic_input = StringOutputLLMNodeInput(user_message="This is a test message.")
        basic_output = await string_output_llm_node(basic_input)
        print(basic_output)
        print("-" * 50)

    import asyncio

    asyncio.run(test_llm_nodes())

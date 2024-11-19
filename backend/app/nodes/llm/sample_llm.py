import asyncio

from pydantic import BaseModel, Field

from ..dynamic_schema import DynamicSchemaNode
from .single_llm_call import SingleLLMCallNode, SingleLLMCallNodeConfig
from .llm_utils import LLMModels, ModelInfo
from ..base import VisualTag


class SampleLLMNodeConfig(SingleLLMCallNodeConfig):
    llm_info: ModelInfo = Field(
        ModelInfo(model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7),
        description="The default LLM model to use"
    )
    system_message: str = Field(
        "You are a helpful assistant.", description="The system message for the LLM"
    )
    user_message: str = Field(
        "What would you like to ask?", description="The user message for the LLM"
    )
    samples: int = Field(1, ge=1, le=10, description="Number of samples to generate")


class SampleLLMNode(DynamicSchemaNode):
    name = "sample_llm_node"
    _llm_node: SingleLLMCallNode
    config_model = SampleLLMNodeConfig
    input_model = BaseModel
    output_model = BaseModel
    visual_tag = VisualTag(acronym="SLN", color="#F4E4D4")

    def setup(self) -> None:
        super().setup()
        self.config_model = SampleLLMNodeConfig

    async def run(self, input_data: BaseModel) -> BaseModel:
        tasks = [self._llm_node(input_data) for _ in range(self.config.samples)]
        responses = await asyncio.gather(*tasks)
        return self.output_model.model_validate(
            [response.model_dump() for response in responses]
        )

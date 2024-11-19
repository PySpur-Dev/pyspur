import asyncio
from typing import Tuple

from pydantic import BaseModel, Field

from ..dynamic_schema import DynamicSchemaNode
from .single_llm_call import SingleLLMCallNode, SingleLLMCallNodeConfig
from .llm_utils import LLMModels, ModelInfo


class BestOfNNodeConfig(SingleLLMCallNodeConfig):
    samples: int = Field(3, ge=1, le=10, description="Number of samples to generate")
    rating_prompt: str = Field(
        "Rate the following response on a scale from 0 to 10, where 0 is poor and 10 is excellent. "
        "Consider factors such as relevance, coherence, and helpfulness. Respond with only a number.",
        description="The prompt for the rating LLM",
    )
    rating_temperature: float = Field(
        0.1,
        ge=0.0,
        le=2.0,
        description="Temperature for randomness, between 0.0 and 1.0",
    )
    rating_max_tokens: int = Field(
        16, ge=1, le=4096, description="Number of tokens, between 1 and 4096"
    )
    llm_info: ModelInfo = Field(
        ModelInfo(model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7),
        description="The default LLM model to use",
    )


class BestOfNNode(DynamicSchemaNode):
    name = "best_of_n_node"
    config_model = BestOfNNodeConfig
    input_model = BaseModel
    output_model = BaseModel

    def setup(self) -> None:
        super().setup()

        # Initialize the LLM node for generating samples
        llm_node_config = SingleLLMCallNodeConfig.model_validate(
            self.config.model_dump()
        )
        self._llm_node = SingleLLMCallNode(llm_node_config)

        # Initialize the LLM node for rating responses
        rating_llm_config = SingleLLMCallNodeConfig(
            llm_info=self.config.llm_info,
            system_message=self.config.rating_prompt,
            user_message=self.get_jinja2_template_for_fields(
                list(self.config.output_schema.keys())
            ),
            input_schema=self.config.output_schema,
            output_schema={"rating": "float"},
        )
        self._rating_llm_node = SingleLLMCallNode(rating_llm_config)

    async def _generate_response_and_rate_it(
        self, input_data: BaseModel
    ) -> Tuple[BaseModel, float]:
        response = await self._llm_node(
            self._llm_node.input_model.model_validate(input_data.model_dump())
        )
        _response = self._rating_llm_node.input_model.model_validate(
            response.model_dump()
        )
        rating_llm_config_dump = self._rating_llm_node.config.model_dump()
        rating_llm_config_dump["system_message"] = self.hydrate_jinja2_template(
            rating_llm_config_dump["system_message"], input_data.model_dump()
        )
        self._rating_llm_node = SingleLLMCallNode(
            SingleLLMCallNodeConfig.model_validate(rating_llm_config_dump)
        )

        rating_output = await self._rating_llm_node(_response)
        rating = rating_output.model_dump().get("rating", 0.0)
        return response, float(rating)

    async def run(self, input_data: BaseModel) -> BaseModel:
        tasks = [
            self._generate_response_and_rate_it(input_data)
            for _ in range(self.config.samples)
        ]
        responses_and_ratings = await asyncio.gather(*tasks)
        self._responses_and_ratings = responses_and_ratings
        best_response, _ = max(responses_and_ratings, key=lambda x: x[1])
        return best_response

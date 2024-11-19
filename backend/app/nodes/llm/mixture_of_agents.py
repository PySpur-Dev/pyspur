import asyncio
from typing import List

from .llm_utils import LLMModels, ModelInfo
from .string_output_llm import (
    StringOutputLLMNode,
    StringOutputLLMNodeConfig,
    StringOutputLLMNodeInput,
    StringOutputLLMNodeOutput,
)
from pydantic import Field
from ..base import VisualTag


class MixtureOfAgentsNodeConfig(StringOutputLLMNodeConfig):
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
    samples: int = 3
    critique_prompt_template: str = (
        "Original query: {initial_query}\n\n"
        "I will present you with {num_candidates} candidate responses to the original query. "
        "Please analyze and critique each response, discussing their strengths and weaknesses. "
        "Provide your analysis for each candidate separately.\n\n"
        "{candidates_section}"
        "Please provide your critique for each candidate:"
    )
    final_prompt_template: str = (
        "Original query: {initial_query}\n\n"
        "Based on the following candidate responses and their critiques, generate a final response to the original query.\n\n"
        "{candidates_section}"
        "Critiques of all candidates:\n{critiques}\n\n"
        "Please provide a final, optimized response to the original query:"
    )


class MixtureOfAgentsNode(StringOutputLLMNode):
    name: str = "mixture_of_agents_node"
    config_model = MixtureOfAgentsNodeConfig
    input_model = StringOutputLLMNodeInput
    output_model = StringOutputLLMNodeOutput
    visual_tag = VisualTag(acronym="MoA", color="#E4D4F4")

    def setup(self) -> None:
        super().setup()

        config = self.config
        # Initialize the LLM node for generating samples
        initial_llm_node_config = StringOutputLLMNodeConfig.model_validate(
            config.model_dump()
        )
        self.initial_llm_node = StringOutputLLMNode(initial_llm_node_config)

        # Initialize the LLM node for critiquing responses
        critique_llm_config = StringOutputLLMNodeConfig(
            llm_info=config.llm_info,
            system_message=config.system_message,
            user_message=config.user_message,
            json_mode=config.json_mode,
        )
        self._critique_llm_node = StringOutputLLMNode(critique_llm_config)

        # Initialize the LLM node for generating final response
        final_llm_config = StringOutputLLMNodeConfig(
            llm_info=config.llm_info,
            system_message=config.system_message,
            user_message=config.user_message,
            json_mode=config.json_mode,
        )
        self._final_llm_node = StringOutputLLMNode(final_llm_config)

    async def _generate_initial_responses(
        self, input_data: StringOutputLLMNodeInput
    ) -> List[StringOutputLLMNodeOutput]:
        tasks = [self.initial_llm_node(input_data) for _ in range(self.config.samples)]
        responses = await asyncio.gather(*tasks)
        return [
            StringOutputLLMNodeOutput.model_validate(response.model_dump())
            for response in responses
        ]

    async def run(
        self, input_data: StringOutputLLMNodeInput
    ) -> StringOutputLLMNodeOutput:
        # Generate initial responses
        initial_responses = await self._generate_initial_responses(input_data)

        # Build the candidates section
        candidates_section: str = ""
        for idx, response in enumerate(initial_responses, start=1):
            candidates_section += f"Candidate {idx}:\n{response.assistant_message}\n\n"

        # Prepare the critique prompt
        critique_prompt: str = self.config.critique_prompt_template.format(
            initial_query=input_data.user_message,
            num_candidates=self.config.samples,
            candidates_section=candidates_section,
        )

        # Build the input for the critique LLM node
        critique_input = StringOutputLLMNodeInput(user_message=critique_prompt)

        # Get the critiques
        critique_output = await self._critique_llm_node(critique_input)
        critiques = critique_output.assistant_message + "\n"  # type: ignore

        # Prepare the final prompt
        final_prompt: str = self.config.final_prompt_template.format(
            initial_query=input_data.user_message,
            candidates_section=candidates_section,
            critiques=critiques,
        )

        # Build the input for the final LLM node
        final_input = self._final_llm_node.input_model.model_validate(
            {"user_message": final_prompt}
        )

        # Get the final response
        final_output = await self._final_llm_node(final_input)

        return StringOutputLLMNodeOutput.model_validate(final_output.model_dump())

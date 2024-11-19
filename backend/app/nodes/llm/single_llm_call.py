import json
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from ..dynamic_schema import DynamicSchemaNode, DynamicSchemaNodeConfig
from .llm_utils import LLMModels, ModelInfo, create_messages, generate_text


class SingleLLMCallNodeConfig(DynamicSchemaNodeConfig):
    llm_info: ModelInfo = Field(
        ModelInfo(model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7),
        description="The default LLM model to use",
    )
    system_message: str = Field(
        "You are a helpful assistant.", description="The system message for the LLM"
    )
    user_message: str = Field(
        "{{ input_field_1 }}",
        description="The user message for the LLM, serialized from input_schema",
    )
    input_schema: Dict[str, str] = {"input_field_1": "str"}
    few_shot_examples: Optional[List[Dict[str, str]]] = None


class SingleLLMCallNodeInput(BaseModel):
    pass


class SingleLLMCallNodeOutput(BaseModel):
    pass


class SingleLLMCallNode(DynamicSchemaNode):
    """
    Node type for calling an LLM with structured i/o and support for params in system prompt and user_input.
    """

    name = "single_llm_call_node"
    config_model = SingleLLMCallNodeConfig
    input_model = SingleLLMCallNodeInput
    output_model = SingleLLMCallNodeOutput

    async def run(self, input_data: BaseModel) -> BaseModel:
        output_schema = self.config.output_schema

        input_data_dict = input_data.model_dump()
        config_data_dict = self.config.model_dump()

        system_message = self.hydrate_jinja2_template(
            self.config.system_message, {**input_data_dict, **config_data_dict}
        )
        system_message += (
            f"\nMake sure the output follows this JSON schema: {output_schema}"
        )

        # Render the user_message using Jinja2 template
        user_message = self.hydrate_jinja2_template(
            self.config.user_message, input_data_dict
        )

        messages = create_messages(
            system_message=system_message,
            user_message=user_message,
            few_shot_examples=self.config.few_shot_examples,
        )
        assistant_message = await generate_text(
            messages=messages,
            model_name=LLMModels(self.config.llm_info.model).value,
            temperature=self.config.llm_info.temperature,
            json_mode=True,
        )
        assistant_message = json.loads(assistant_message)
        assistant_message = self.output_model.model_validate(assistant_message)
        return assistant_message


if __name__ == "__main__":

    async def test_llm_nodes():
        # Example 1: Simple test case with a basic user message
        simple_llm_node = SingleLLMCallNode(
            config=SingleLLMCallNodeConfig(
                llm_info=ModelInfo(
                    model=LLMModels.GPT_4O_MINI, temperature=0.1, max_tokens=100
                ),
                system_message="This is a simple test prompt for {{ your_name }}.",
                user_message="Hello, my name is {{ your_name }}. I want to ask: {{ user_message }}",
                output_schema={"response": "str", "your_name": "str"},
                input_schema={"user_message": "str", "your_name": "str"},
            )
        )
        simple_input = simple_llm_node.input_model.model_validate(
            {"user_message": "What is the weather today?", "your_name": "Alice"}
        )
        simple_output = await simple_llm_node(simple_input)
        print("Simple Test Output:", simple_output)

        # Example 2: More complex test case with additional variables
        complex_llm_node = SingleLLMCallNode(
            config=SingleLLMCallNodeConfig(
                llm_info=ModelInfo(
                    model=LLMModels.GPT_4O_MINI, temperature=0.2, max_tokens=200
                ),
                system_message="This is a complex test prompt for {{ your_name }}, who is {{ age }} years old.",
                user_message="Hi, I am {{ your_name }}. I am {{ age }} years old and I want to ask: {{ user_message }}",
                output_schema={"response": "str", "your_name": "str", "age": "int"},
                input_schema={"user_message": "str", "your_name": "str", "age": "int"},
            )
        )
        complex_input = complex_llm_node.input_model.model_validate(
            {"user_message": "Can you tell me a joke?", "your_name": "Bob", "age": 30}
        )
        complex_output = await complex_llm_node(complex_input)
        print("Complex Test Output:", complex_output)

    import asyncio

    asyncio.run(test_llm_nodes())

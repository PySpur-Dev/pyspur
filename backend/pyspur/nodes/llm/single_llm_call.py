import json
from typing import Dict, List, Optional

from dotenv import load_dotenv
from jinja2 import Template
from pydantic import BaseModel, Field

from ...utils.pydantic_utils import get_nested_field, json_schema_to_model
from ..base import (
    BaseNode,
    BaseNodeConfig,
    BaseNodeInput,
    BaseNodeOutput,
)
from ._utils import LLMModels, ModelInfo, create_messages, generate_text

load_dotenv()


def repair_json(broken_json_str: str) -> str:
    import re
    from re import Match
    from typing import Dict

    # Handle empty or non-string input
    if not broken_json_str or not broken_json_str.strip():
        return "{}"

    repaired = broken_json_str

    # Remove common LLM artifacts like XML/markdown tags that might be mixed in with JSON
    repaired = re.sub(r"</?(invoke|function_call|thinking).*?>", "", repaired)

    # Remove markdown code block markers if present
    repaired = re.sub(r"^```(json)?|```$", "", repaired, flags=re.MULTILINE)

    # Try to extract just the JSON part if it's mixed with other text
    json_match = re.search(r"(\{[\s\S]*\})", repaired)
    if json_match:
        repaired = json_match.group(1)

    # Convert single quotes to double quotes, but not within already double-quoted strings
    # First, temporarily replace valid double-quoted strings
    placeholder = "PLACEHOLDER"
    quoted_strings: Dict[str, str] = {}
    counter = 0

    def replace_quoted(match: Match[str]) -> str:
        nonlocal counter
        key = f"{placeholder}{counter}"
        quoted_strings[key] = match.group(0)
        counter += 1
        return key

    # Temporarily store valid double-quoted strings
    repaired = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', replace_quoted, repaired)

    # Now convert remaining single quotes to double quotes
    repaired = repaired.replace("'", '"')

    # Restore original double-quoted strings
    for key, value in quoted_strings.items():
        repaired = repaired.replace(key, value)

    # Remove trailing commas before closing brackets/braces
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)

    # Add missing commas between elements
    repaired = re.sub(r"([}\"])\s*([{\[])", r"\1,\2", repaired)

    # Fix unquoted string values
    repaired = re.sub(r"([{,]\s*)(\w+)(\s*:)", r'\1"\2"\3', repaired)

    # Remove any extra whitespace around colons
    repaired = re.sub(r"\s*:\s*", ":", repaired)

    # If the string is wrapped in extra quotes, remove them
    if repaired.startswith('"') and repaired.endswith('"'):
        repaired = repaired[1:-1]

    # Extract the substring from the first { to the last }
    start = repaired.find("{")
    end = repaired.rfind("}")
    if start != -1 and end != -1:
        repaired = repaired[start : end + 1]
    else:
        # If no valid JSON object found, return empty object
        return "{}"

    # Final cleanup of whitespace
    repaired = re.sub(r"\s+", " ", repaired)

    return repaired


class SingleLLMCallNodeConfig(BaseNodeConfig):
    llm_info: ModelInfo = Field(
        ModelInfo(model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7),
        description="The default LLM model to use",
    )
    system_message: str = Field(
        "You are a helpful assistant.",
        description="The system message for the LLM",
    )
    user_message: str = Field(
        "",
        description="The user message for the LLM, serialized from input_schema",
    )
    few_shot_examples: Optional[List[Dict[str, str]]] = None
    url_variables: Optional[Dict[str, str]] = Field(
        None,
        description="Optional mapping of URL types (image, video, pdf) to input schema variables for Gemini models",
    )
    enable_thinking: bool = Field(
        False,
        description="Whether to enable thinking mode for supported models",
    )
    thinking_budget_tokens: Optional[int] = Field(
        None,
        description="Budget tokens for thinking mode when enabled",
    )
    enable_message_history: bool = Field(
        False,
        description="Whether to include message history from input in the LLM request",
    )
    message_history_variable: Optional[str] = Field(
        None,
        description="Input variable containing message history (e.g., 'message_history')",
    )


class SingleLLMCallNodeInput(BaseNodeInput):
    """We allow any/all extra fields, so that the entire dictionary passed in
    is available in `input.model_dump()`.
    """

    class Config:
        extra = "allow"


class SingleLLMCallNodeOutput(BaseNodeOutput):
    pass


class SingleLLMCallNode(BaseNode):
    """Node type for calling an LLM with structured i/o and support for params in system prompt and user_input."""

    name = "single_llm_call_node"
    display_name = "Single LLM Call"
    config_model = SingleLLMCallNodeConfig
    input_model = SingleLLMCallNodeInput
    output_model = SingleLLMCallNodeOutput

    def setup(self) -> None:
        super().setup()
        if self.config.output_json_schema:
            self.output_model = json_schema_to_model(
                json.loads(self.config.output_json_schema),
                self.name,
                SingleLLMCallNodeOutput,
            )  # type: ignore

    async def run(self, input: BaseModel) -> BaseModel:
        # Grab the entire dictionary from the input
        raw_input_dict = input.model_dump()

        # Render system_message
        system_message = Template(self.config.system_message).render(raw_input_dict)

        try:
            # If user_message is empty, dump the entire raw dictionary
            if not self.config.user_message.strip():
                user_message = json.dumps(raw_input_dict, indent=2)
            else:
                user_message = Template(self.config.user_message).render(**raw_input_dict)
        except Exception as e:
            print(f"[ERROR] Failed to render user_message {self.name}")
            print(f"[ERROR] user_message: {self.config.user_message} with input: {raw_input_dict}")
            raise e

        # Extract message history from input if enabled
        history: Optional[List[Dict[str, str]]] = None
        if self.config.enable_message_history and self.config.message_history_variable:
            try:
                # Try to get history from the specified variable
                history_var = self.config.message_history_variable
                if "." in history_var:
                    # Handle nested fields (e.g., "input_node.message_history")
                    history = get_nested_field(history_var, input)
                else:
                    # Direct field access
                    history = raw_input_dict.get(history_var)

                if history is not None:
                    print(
                        f"[WARNING] Message history must be a list, but got {type(history).__name__}"
                    )
                    history = None
            except Exception as e:
                print(f"[ERROR] Failed to extract message history: {e}")
                history = None

        messages = create_messages(
            system_message=system_message,
            user_message=user_message,
            few_shot_examples=self.config.few_shot_examples,
            history=history,
        )

        model_name = LLMModels(self.config.llm_info.model).value

        url_vars: Optional[Dict[str, str]] = None
        # Process URL variables if they exist and we're using a Gemini model
        if self.config.url_variables:
            url_vars = {}
            if "file" in self.config.url_variables:
                # Split the input variable reference (e.g. "input_node.video_url")
                # Get the nested field value using the helper function
                file_value = get_nested_field(self.config.url_variables["file"], input)
                # Always use image_url format regardless of file type
                url_vars["image"] = file_value

        # Prepare thinking parameters if enabled
        thinking_params = None
        if self.config.enable_thinking:
            model_info = LLMModels.get_model_info(model_name)
            if model_info and model_info.constraints.supports_thinking:
                thinking_params = {
                    "type": "enabled",
                    "budget_tokens": self.config.thinking_budget_tokens
                    or model_info.constraints.thinking_budget_tokens
                    or 1024,
                }

        try:
            assistant_message_str = await generate_text(
                messages=messages,
                model_name=model_name,
                temperature=self.config.llm_info.temperature,
                max_tokens=self.config.llm_info.max_tokens,
                json_mode=True,
                url_variables=url_vars,
                output_json_schema=self.config.output_json_schema,
                thinking=thinking_params,
            )
        except Exception as e:
            error_str = str(e)

            # Handle all LiteLLM errors
            if "litellm" in error_str.lower():
                error_message = "An error occurred with the LLM service"
                error_type = "unknown"

                # Extract provider from model name
                provider = model_name.split("/")[0] if "/" in model_name else "unknown"

                # Handle specific known error cases
                if "VertexAIError" in error_str and "The model is overloaded" in error_str:
                    error_type = "overloaded"
                    error_message = "The model is currently overloaded. Please try again later."
                elif "rate limit" in error_str.lower():
                    error_type = "rate_limit"
                    error_message = "Rate limit exceeded. Please try again in a few minutes."
                elif "context length" in error_str.lower() or "maximum token" in error_str.lower():
                    error_type = "context_length"
                    error_message = "Input is too long for the model's context window. Please reduce the input length."
                elif (
                    "invalid api key" in error_str.lower() or "authentication" in error_str.lower()
                ):
                    error_type = "auth"
                    error_message = (
                        "Authentication error with the LLM service. Please check your API key."
                    )
                elif "bad gateway" in error_str.lower() or "503" in error_str:
                    error_type = "service_unavailable"
                    error_message = (
                        "The LLM service is temporarily unavailable. Please try again later."
                    )

                raise Exception(
                    json.dumps(
                        {
                            "type": "model_provider_error",
                            "provider": provider,
                            "error_type": error_type,
                            "message": error_message,
                            "original_error": error_str,
                        }
                    )
                )
            raise e

        try:
            assistant_message_dict = json.loads(assistant_message_str)

            # Add a type check to ensure we have a dictionary
            if not isinstance(assistant_message_dict, dict):
                # If we parsed JSON successfully but got a non-dict result (like a string with XML tags),
                # try to repair it
                repaired_str = repair_json(str(assistant_message_dict))
                assistant_message_dict = json.loads(repaired_str)
        except Exception:
            try:
                repaired_str = repair_json(assistant_message_str)
                assistant_message_dict = json.loads(repaired_str)
            except Exception as inner_e:
                error_str = str(inner_e)
                error_message = (
                    "An error occurred while parsing and repairing the assistant message"
                )
                error_type = "json_parse_error"
                raise Exception(
                    json.dumps(
                        {
                            "type": "parsing_error",
                            "error_type": error_type,
                            "message": error_message,
                            "original_error": error_str,
                            "assistant_message_str": assistant_message_str,
                        }
                    )
                )

        # Validate and return
        try:
            assistant_message = self.output_model.model_validate(assistant_message_dict)
            return assistant_message
        except Exception as e:
            # For better debugging, include the raw response
            raw_response = assistant_message_str

            # Also include what we attempted to validate
            validation_input = json.dumps(assistant_message_dict, default=str)

            error_message = (
                f"The LLM did not return valid JSON that matches the expected schema.\n\n"
                f"Raw LLM response:\n{raw_response}\n\n"
                f"Attempted to validate:\n{validation_input}\n\n"
                f"Validation error: {str(e)}"
            )

            raise Exception(
                json.dumps(
                    {
                        "type": "invalid_json_format",
                        "message": error_message,
                        "original_response": raw_response,
                        "validation_input": validation_input,
                        "validation_error": str(e),
                    }
                )
            )


if __name__ == "__main__":
    import asyncio

    from pydantic import create_model

    async def test_llm_nodes():
        # Example 1: Simple test case with a basic user message
        simple_llm_node = SingleLLMCallNode(
            name="WeatherBot",
            config=SingleLLMCallNodeConfig(
                llm_info=ModelInfo(model=LLMModels.GPT_4O, temperature=0.4, max_tokens=100),
                system_message="You are a helpful assistant.",
                user_message="Hello, my name is {{ name }}. I want to ask: {{ question }}",
                url_variables=None,
                enable_thinking=False,
                thinking_budget_tokens=None,
                enable_message_history=False,
                message_history_variable=None,
                output_json_schema=json.dumps(
                    {
                        "type": "object",
                        "properties": {
                            "answer": {"type": "string"},
                            "name_of_user": {"type": "string"},
                        },
                        "required": ["answer", "name_of_user"],
                    }
                ),
            ),
        )

        simple_input = create_model(
            "SimpleInput",
            name=(str, ...),
            question=(str, ...),
            __base__=BaseNodeInput,
        ).model_validate(
            {
                "name": "Alice",
                "question": "What is the weather like in New York in January?",
            }
        )

        print("[DEBUG] Testing simple_llm_node now...")
        simple_output = await simple_llm_node(simple_input)
        print("[DEBUG] Test Output from single_llm_call:", simple_output)

        # Example 2: Using message history
        chat_llm_node = SingleLLMCallNode(
            name="ChatBot",
            config=SingleLLMCallNodeConfig(
                llm_info=ModelInfo(model=LLMModels.GPT_4O, temperature=0.7, max_tokens=100),
                system_message="You are a helpful and friendly assistant. Maintain conversation context.",
                user_message="{{ user_message }}",
                url_variables=None,
                enable_thinking=False,
                thinking_budget_tokens=None,
                enable_message_history=True,
                message_history_variable="message_history",
                output_json_schema=json.dumps(
                    {
                        "type": "object",
                        "properties": {"assistant_message": {"type": "string"}},
                        "required": ["assistant_message"],
                    }
                ),
            ),
        )

        # Create input with message history
        chat_input = create_model(
            "ChatInput",
            user_message=(str, ...),
            message_history=(list, ...),
            __base__=BaseNodeInput,
        ).model_validate(
            {
                "user_message": "What's the capital of France?",
                "message_history": [
                    {"role": "user", "content": "Hello, can you help me with geography questions?"},
                    {
                        "role": "assistant",
                        "content": "Of course! I'd be happy to help with geography questions. What would you like to know?",
                    },
                ],
            }
        )

        print("[DEBUG] Testing chat_llm_node with message history...")
        chat_output = await chat_llm_node(chat_input)
        print("[DEBUG] Test Output from chat with history:", chat_output)

    asyncio.run(test_llm_nodes())

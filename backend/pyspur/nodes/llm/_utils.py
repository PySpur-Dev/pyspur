# type: ignore
import base64
import json
import logging
import os
import re
from typing import Any, Callable, Dict, List, Optional

import litellm
from docx2python import docx2python
from dotenv import load_dotenv
from litellm import acompletion
from ollama import AsyncClient
from pydantic import BaseModel, Field
from tenacity import AsyncRetrying, stop_after_attempt, wait_random_exponential

from ...utils.file_utils import encode_file_to_base64_data_url
from ...utils.mime_types_utils import get_mime_type_for_url
from ...utils.path_utils import is_external_url, resolve_file_path
from ._model_info import LLMModels
from ._providers import OllamaOptions, setup_azure_configuration

# uncomment for debugging litellm issues
# litellm.set_verbose=True
load_dotenv()

# Enable parameter dropping for unsupported parameters
litellm.drop_params = True

# Clean up Azure API base URL if needed
azure_api_base = os.getenv("AZURE_OPENAI_API_BASE", "").rstrip("/")
if azure_api_base.endswith("/openai"):
    azure_api_base = azure_api_base.rstrip("/openai")
os.environ["AZURE_OPENAI_API_BASE"] = azure_api_base

# Set OpenAI base URL if provided
openai_base_url = os.getenv("OPENAI_API_BASE")
if openai_base_url:
    litellm.api_base = openai_base_url

# If Azure OpenAi is configured, set it as the default provider
if os.getenv("AZURE_OPENAI_API_KEY"):
    litellm.api_key = os.getenv("AZURE_OPENAI_API_KEY")


class ModelInfo(BaseModel):
    model: LLMModels = Field(LLMModels.GPT_4O, description="The LLM model to use for completion")
    max_tokens: Optional[int] = Field(
        ...,
        ge=1,
        le=65536,
        description="Maximum number of tokens the model can generate",
    )
    temperature: Optional[float] = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Temperature for randomness, between 0.0 and 1.0",
    )
    top_p: Optional[float] = Field(
        default=0.9,
        ge=0.0,
        le=1.0,
        description="Top-p sampling value, between 0.0 and 1.0",
    )


def create_messages(
    system_message: str,
    user_message: str,
    few_shot_examples: Optional[List[Dict[str, str]]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, str]]:
    messages = [{"role": "system", "content": system_message}]
    if few_shot_examples:
        for example in few_shot_examples:
            messages.append({"role": "user", "content": example["input"]})
            messages.append({"role": "assistant", "content": example["output"]})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    return messages


def create_messages_with_images(
    system_message: str,
    base64_image: str,
    user_message: str = "",
    few_shot_examples: Optional[List[Dict]] = None,
    history: Optional[List[Dict]] = None,
) -> List[Dict[str, str]]:
    messages = [
        {
            "role": "system",
            "content": [{"type": "text", "text": system_message}],
        }
    ]
    if few_shot_examples:
        for example in few_shot_examples:
            messages.append(
                {
                    "role": "user",
                    "content": [{"type": "text", "text": example["input"]}],
                }
            )
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": example["img"]},
                        }
                    ],
                }
            )
            messages.append(
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": example["output"]}],
                }
            )
    if history:
        messages.extend(history)
    messages.append(
        {
            "role": "user",
            "content": [{"type": "image_url", "image_url": {"url": base64_image}}],
        }
    )
    if user_message:
        messages[-1]["content"].append({"type": "text", "text": user_message})
    return messages


def async_retry(*dargs, **dkwargs):
    def decorator(f: Callable) -> Callable:
        r = AsyncRetrying(*dargs, **dkwargs)

        async def wrapped_f(*args, **kwargs):
            async for attempt in r:
                with attempt:
                    return await f(*args, **kwargs)

        return wrapped_f

    return decorator


@async_retry(
    wait=wait_random_exponential(min=30, max=120),
    stop=stop_after_attempt(3),
    retry=lambda e: not isinstance(
        e,
        (
            litellm.exceptions.AuthenticationError,
            ValueError,
            litellm.exceptions.RateLimitError,
        ),
    ),
)
async def completion_with_backoff(**kwargs) -> str:
    """Calls the LLM completion endpoint with backoff.
    Supports Azure OpenAI, standard OpenAI, or Ollama based on the model name.
    """
    try:
        model = kwargs.get("model", "")
        logging.info("=== LLM Request Configuration ===")
        logging.info(f"Requested Model: {model}")

        # Use Azure if either 'azure/' is prefixed or if an Azure API key is provided and not using Ollama
        if model.startswith("azure/") or (
            os.getenv("AZURE_OPENAI_API_KEY") and not model.startswith("ollama/")
        ):
            azure_kwargs = setup_azure_configuration(kwargs)
            logging.info(f"Using Azure config for model: {azure_kwargs['model']}")
            try:
                response = await acompletion(**azure_kwargs, drop_params=True)
                return response.choices[0].message.content
            except Exception as e:
                logging.error(f"Error calling Azure OpenAI: {e}")
                raise

        elif model.startswith("ollama/"):
            logging.info("=== Ollama Configuration ===")
            response = await acompletion(**kwargs, drop_params=True)
            return response.choices[0].message.content
        else:
            logging.info("=== Standard Configuration ===")
            response = await acompletion(**kwargs, drop_params=True)
            return response.choices[0].message.content

    except Exception as e:
        logging.error("=== LLM Request Error ===")
        # Create a save copy of kwargs without sensitive information
        save_config = kwargs.copy()
        save_config["api_key"] = "********" if "api_key" in save_config else None
        logging.error(f"Error occurred with configuration: {save_config}")
        logging.error(f"Error type: {type(e).__name__}")
        logging.error(f"Error message: {str(e)}")
        if hasattr(e, "response"):
            logging.error(f"Response status: {getattr(e.response, 'status_code', 'N/A')}")
            logging.error(f"Response body: {getattr(e.response, 'text', 'N/A')}")
        raise e


def sanitize_json_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    """Makes a JSON schema compatible with the LLM providers.
    * sets "additionalProperties" to False
    * adds all properties to the "required" list recursively
    """
    if "additionalProperties" not in schema:
        schema["additionalProperties"] = False
    if "properties" in schema:
        for key, value in schema["properties"].items():
            if "required" not in schema:
                schema["required"] = []
            if key not in schema["required"]:
                schema["required"].append(key)
            sanitize_json_schema(value)
    return schema


async def generate_text(
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float = 0.5,
    json_mode: bool = False,
    max_tokens: int = 16384,
    api_base: Optional[str] = None,
    url_variables: Optional[Dict[str, str]] = None,
    output_json_schema: Optional[str] = None,
    functions: Optional[List[Dict[str, Any]]] = None,
    function_call: Optional[str] = None,
    thinking: Optional[Dict[str, Any]] = None,
) -> str:
    kwargs = {
        "model": model_name,
        "max_tokens": max_tokens,
        "messages": messages,
        "temperature": temperature,
    }

    # Add function calling parameters if provided
    if functions:
        kwargs["functions"] = functions
        if function_call:
            kwargs["function_call"] = function_call

    # Get model info to check capabilities
    model_info = LLMModels.get_model_info(model_name)

    # Only add thinking parameters if explicitly requested and supported by the model
    if thinking and model_info and model_info.constraints.supports_thinking:
        kwargs["thinking"] = thinking

    if model_name == "deepseek/deepseek-reasoner":
        kwargs.pop("temperature")

    # Get model info to check if it supports JSON output
    if model_info and not model_info.constraints.supports_temperature:
        kwargs.pop("temperature", None)
    if model_info and not model_info.constraints.supports_max_tokens:
        kwargs.pop("max_tokens", None)
    supports_json = model_info and model_info.constraints.supports_JSON_output

    # Only process JSON schema if the model supports it
    if supports_json:
        if output_json_schema is None:
            output_json_schema = {
                "type": "object",
                "properties": {"output": {"type": "string"}},
                "required": ["output"],
            }
        elif output_json_schema.strip() != "":
            output_json_schema = json.loads(output_json_schema)
            output_json_schema = sanitize_json_schema(output_json_schema)
        else:
            raise ValueError("Invalid output schema", output_json_schema)
        output_json_schema["additionalProperties"] = False

        # check if the model supports response format
        if "response_format" in litellm.get_supported_openai_params(
            model=model_name, custom_llm_provider=model_info.provider
        ):
            if litellm.supports_response_schema(
                model=model_name, custom_llm_provider=model_info.provider
            ) or model_name.startswith("anthropic"):
                if "name" not in output_json_schema and "schema" not in output_json_schema:
                    output_json_schema = {
                        "schema": output_json_schema,
                        "strict": True,
                        "name": "output",
                    }
                kwargs["response_format"] = {
                    "type": "json_schema",
                    "json_schema": output_json_schema,
                }
            else:
                kwargs["response_format"] = {"type": "json_object"}
                schema_for_prompt = json.dumps(output_json_schema)
                system_message = next(
                    message for message in messages if message["role"] == "system"
                )
                system_message["content"] += (
                    "\nYou must respond with valid JSON only. No other text before or after the JSON Object. The JSON Object must adhere to this schema: "
                    + schema_for_prompt
                )

    if json_mode and supports_json:
        if model_name.startswith("ollama"):
            if api_base is None:
                api_base = os.getenv("OLLAMA_BASE_URL")
            options = OllamaOptions(temperature=temperature, max_tokens=max_tokens)
            raw_response = await ollama_with_backoff(
                model=model_name,
                options=options,
                messages=messages,
                format="json",
                api_base=api_base,
            )
            response = raw_response
        # Handle inputs with URL variables
        elif url_variables:
            # check if the mime type is supported
            mime_type = get_mime_type_for_url(url_variables["image"])
            if not model_info.constraints.is_mime_type_supported(mime_type):
                raise ValueError(
                    f"""Unsupported file type: "{mime_type.value}" for model {model_name}. Supported types: {[mime.value for mime in model_info.constraints.supported_mime_types]}"""
                )

            # Transform messages to include URL content
            transformed_messages = []
            for msg in messages:
                if msg["role"] == "user":
                    content = [{"type": "text", "text": msg["content"]}]
                    # Add any URL variables as image_url or other supported types
                    for _, url in url_variables.items():
                        if url:  # Only add if URL is provided
                            # Check if the URL is a base64 data URL
                            if is_external_url(url) or url.startswith("data:"):
                                content.append(
                                    {
                                        "type": "image_url",
                                        "image_url": {"url": url},
                                    }
                                )
                            else:
                                # For file paths, encode the file with appropriate MIME type
                                try:
                                    # Use the new path resolution utility
                                    file_path = resolve_file_path(url)
                                    logging.info(f"Reading file from: {file_path}")

                                    # Check if file is a DOCX file
                                    if str(file_path).lower().endswith(".docx"):
                                        # Convert DOCX to XML
                                        xml_content = convert_docx_to_xml(str(file_path))
                                        # Encode the XML content directly
                                        data_url = f"data:text/xml;base64,{base64.b64encode(xml_content.encode()).decode()}"
                                    else:
                                        data_url = encode_file_to_base64_data_url(str(file_path))

                                    content.append(
                                        {
                                            "type": "image_url",
                                            "image_url": {"url": data_url},
                                        }
                                    )
                                except Exception as e:
                                    logging.error(f"Error reading file {url}: {str(e)}")
                                    raise
                    msg["content"] = content
                transformed_messages.append(msg)
            kwargs["messages"] = transformed_messages
            raw_response = await completion_with_backoff(**kwargs)
            response = raw_response
        else:
            raw_response = await completion_with_backoff(**kwargs)
            response = raw_response
    else:
        if model_name.startswith("ollama"):
            if api_base is None:
                api_base = os.getenv("OLLAMA_BASE_URL")
            kwargs["api_base"] = api_base
        raw_response = await completion_with_backoff(**kwargs)
        response = raw_response

    # For models that don't support JSON output, wrap the response in a JSON structure
    if not supports_json:
        sanitized_response = response.replace('"', '\\"').replace("\n", "\\n")
        if model_info and model_info.constraints.supports_reasoning:
            separator = model_info.constraints.reasoning_separator
            sanitized_response = re.sub(separator, "", sanitized_response, flags=re.DOTALL)

        # Check for provider-specific fields
        if hasattr(raw_response, "choices") and len(raw_response.choices) > 0:
            if hasattr(raw_response.choices[0].message, "provider_specific_fields"):
                provider_fields = raw_response.choices[0].message.provider_specific_fields
                return json.dumps(
                    {
                        "output": sanitized_response,
                        "provider_specific_fields": provider_fields,
                    }
                )
        return f'{{"output": "{sanitized_response}"}}'

    # Ensure response is valid JSON for models that support it
    if supports_json:
        try:
            json.loads(response)
            return response
        except json.JSONDecodeError:
            logging.error(f"Response is not valid JSON: {response}")
            # Try to fix common json issues
            if not response.startswith("{"):
                # Extract JSON if there is extra text
                json_match = re.search(r"\{.*\}", response, re.DOTALL)
                if json_match:
                    response = json_match.group(0)
                    try:
                        json.loads(response)
                        return response
                    except json.JSONDecodeError:
                        pass

            # If all attempts to parse JSON fail, wrap the response in a JSON structure
            sanitized_response = response.replace('"', '\\"').replace("\n", "\\n")
            # Check for provider-specific fields
            if hasattr(raw_response, "choices") and len(raw_response.choices) > 0:
                if hasattr(raw_response.choices[0].message, "provider_specific_fields"):
                    provider_fields = raw_response.choices[0].message.provider_specific_fields
                    return json.dumps(
                        {
                            "output": sanitized_response,
                            "provider_specific_fields": provider_fields,
                        }
                    )
            return f'{{"output": "{sanitized_response}"}}'

    return response


def convert_output_schema_to_json_schema(
    output_schema: Dict[str, Any],
) -> Dict[str, Any]:
    """Convert a simple output schema to a JSON schema.
    Simple output schema is a dictionary with field names and types.
    Types can be one of 'str', 'int', 'float' or 'bool'.
    """
    json_schema = {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    }
    for field, field_type in output_schema.items():
        if field_type == "str" or field_type == "string":
            json_schema["properties"][field] = {"type": "string"}
        elif field_type == "int" or field_type == "integer":
            json_schema["properties"][field] = {"type": "integer"}
        elif field_type == "float" or field_type == "number":
            json_schema["properties"][field] = {"type": "number"}
        elif field_type == "bool" or field_type == "boolean":
            json_schema["properties"][field] = {"type": "boolean"}
        json_schema["required"].append(field)
    return json_schema


def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


@async_retry(wait=wait_random_exponential(min=30, max=120), stop=stop_after_attempt(3))
async def ollama_with_backoff(
    model: str,
    messages: list[dict[str, str]],
    format: Optional[str | dict[str, Any]] = None,
    options: Optional[OllamaOptions] = None,
    api_base: Optional[str] = None,
) -> str:
    """Make an async Ollama API call with exponential backoff retry logic.

    Args:
        model: The name of the Ollama model to use
        messages: List of message dictionaries with 'role' and 'content'
        options: OllamaOptions instance with model parameters
        max_retries: Maximum number of retries
        initial_wait: Initial wait time between retries in seconds
        max_wait: Maximum wait time between retries in seconds

    Returns:
        Either a string response or a validated Pydantic model instance

    """
    client = AsyncClient(host=api_base)
    response = await client.chat(
        model=model.replace("ollama/", ""),
        messages=messages,
        format=format,
        options=(options or OllamaOptions()).to_dict(),
    )
    return response.message.content


def convert_docx_to_xml(file_path: str) -> str:
    """Convert a DOCX file to XML format.

    Args:
        file_path: Path to the DOCX file
    Returns:
        XML string representation of the DOCX file

    """
    try:
        with docx2python(file_path) as docx_content:
            # Convert the document content to XML format
            xml_content = "<?xml version='1.0' encoding='UTF-8'?>\n<document>\n"

            # Add metadata
            xml_content += "<metadata>\n"
            for key, value in docx_content.properties.items():
                if value:  # Only add non-empty properties
                    xml_content += f"<{key}>{value}</{key}>\n"
            xml_content += "</metadata>\n"

            # Add document content
            xml_content += "<content>\n"
            for paragraph in docx_content.text:
                if paragraph:  # Skip empty paragraphs
                    xml_content += f"<paragraph>{paragraph}</paragraph>\n"
            xml_content += "</content>\n"
            xml_content += "</document>"

            return xml_content
    except Exception as e:
        logging.error(f"Error converting DOCX to XML: {str(e)}")
        raise

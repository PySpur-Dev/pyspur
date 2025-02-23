from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import re
from loguru import logger

from ..nodes.llm._utils import generate_text

router = APIRouter()

class SchemaGenerationRequest(BaseModel):
    description: str
    existing_schema: Optional[str] = None

@router.post("/generate_schema/")
async def generate_schema(request: SchemaGenerationRequest) -> Dict[str, Any]:
    response: str = ""
    try:
        # Prepare the system message
        system_message = """You are a JSON Schema expert. Your task is to generate a JSON Schema based on a text description.
        The schema should:
        1. Follow JSON Schema standards
        2. Include appropriate types, required fields, and descriptions
        3. Be clear and well-structured
        4. Include type: "object" at the root
        5. Include a properties object
        6. Set appropriate required fields
        7. Include meaningful descriptions for each field
        8. Return ONLY the JSON schema without any markdown formatting or explanation

        Here are some examples:

        <example>
        Input: "Create a schema for a person with name, age and optional email"
        Output: {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The person's full name"
                },
                "age": {
                    "type": "integer",
                    "description": "The person's age in years",
                    "minimum": 0
                },
                "email": {
                    "type": "string",
                    "description": "The person's email address",
                    "format": "email"
                }
            },
            "required": ["name", "age"]
        }
        </example>

        <example>
        Input: "Schema for a blog post with title, content, author details and tags"
        Output: {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the blog post"
                },
                "content": {
                    "type": "string",
                    "description": "The main content of the blog post"
                },
                "author": {
                    "type": "object",
                    "description": "Details about the post author",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Author's full name"
                        },
                        "bio": {
                            "type": "string",
                            "description": "Short biography of the author"
                        }
                    },
                    "required": ["name"]
                },
                "tags": {
                    "type": "array",
                    "description": "List of tags associated with the post",
                    "items": {
                        "type": "string"
                    }
                }
            },
            "required": ["title", "content", "author"]
        }
        </example>
        """

        # Prepare the user message
        user_message = f"Generate a JSON Schema for the following description:\n{request.description}"

        if request.existing_schema:
            user_message += f"\n\nPlease consider this existing schema as context:\n{request.existing_schema}"
            user_message += "\nModify it based on the description while preserving any compatible parts."

        # Call the LLM
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message}
        ]

        response = await generate_text(
            messages=messages,
            model_name="openai/o3-mini",
            json_mode=True
        )

        # Try to parse the response in different ways
        try:
            # First try: direct JSON parse
            schema = json.loads(response)
            if isinstance(schema, dict) and "output" in schema:
                # If we got a wrapper object with an "output" key, extract the schema from it
                schema_str = schema["output"]
                # Extract JSON from potential markdown code blocks
                json_match = re.search(r'```json\s*(.*?)\s*```', schema_str, re.DOTALL)
                if json_match:
                    schema_str = json_match.group(1)
                schema = json.loads(schema_str)
        except json.JSONDecodeError:
            # Second try: Look for JSON in markdown code blocks
            json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', response, re.DOTALL)
            if json_match:
                schema = json.loads(json_match.group(1))
            else:
                raise ValueError("Could not extract valid JSON schema from response")

        # Validate the schema structure
        if not isinstance(schema, dict) or "type" not in schema or "properties" not in schema:
            raise ValueError("Generated schema is not valid - missing required fields")

        return schema

    except Exception as e:
        # Log the raw response if it exists and is not empty
        if response:
            truncated_response = response[:1000] + '...' if len(response) > 1000 else response
            logger.error(f"Schema generation failed. Raw response (truncated): {truncated_response}. Error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

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

class WorkflowGenerationRequest(BaseModel):
    """Workflow generation request schema."""
    purpose: str
    description: str
    inputs: Optional[Dict[str, str]] = None
    outputs: Optional[Dict[str, str]] = None
    advanced_options: Optional[Dict[str, Any]] = None

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

@router.post("/generate_workflow/")
async def generate_workflow(request: WorkflowGenerationRequest) -> Dict[str, Any]:
    """Generate a workflow definition using AI."""
    response = ""
    try:
        # Prepare system message with workflow creation instructions
        system_message = """You are an AI workflow architect expert. Your task is to create a complete workflow definition based on the user's requirements.

The workflow should follow the specific JSON structure with nodes and links.

Here's an example of a workflow that summarizes articles or papers and posts them to Slack:
```json
{
  "nodes": [
    {
      "id": "input_node",
      "title": "input_node",
      "parent_id": null,
      "node_type": "InputNode",
      "config": {
        "output_schema": {
          "blogpost_url": "string",
          "paper_pdf_file": "string"
        },
        "output_json_schema": "{\\"type\\": \\"object\\",\\"properties\\": {\\"blogpost_url\\": {\\"type\\": \\"string\\"},\\"paper_pdf_file\\": {\\"type\\": \\"string\\"}},\\"required\\": [\\"blogpost_url\\",\\"paper_pdf_file\\"]}",
        "has_fixed_output": false,
        "enforce_schema": false
      },
      "coordinates": {
        "x": 0,
        "y": 432
      },
      "dimensions": null,
      "subworkflow": null
    },
    {
      "id": "RouterNode_1",
      "title": "RouterNode_1",
      "parent_id": null,
      "node_type": "RouterNode",
      "config": {
        "title": "RouterNode_1",
        "type": "object",
        "output_schema": {
          "output": "string"
        },
        "output_json_schema": "{...}",
        "has_fixed_output": false,
        "route_map": {
          "route1": {
            "conditions": [
              {
                "logicalOperator": "AND",
                "operator": "is_not_empty",
                "value": "",
                "variable": "input_node.blogpost_url"
              }
            ]
          },
          "route2": {
            "conditions": [
              {
                "variable": "input_node.paper_pdf_file",
                "operator": "is_not_empty",
                "value": ""
              }
            ]
          }
        }
      },
      "coordinates": {
        "x": 438,
        "y": 0
      },
      "dimensions": {
        "width": 428,
        "height": 1077
      },
      "subworkflow": null
    },
    {
      "id": "SingleLLMCallNode_1",
      "title": "KeyPointsSummarizer",
      "parent_id": null,
      "node_type": "SingleLLMCallNode",
      "config": {
        "title": "KeyPointsSummarizer",
        "type": "object",
        "output_schema": {
          "output": "string"
        },
        "output_json_schema": "{...}",
        "has_fixed_output": false,
        "llm_info": {
          "model": "openai/chatgpt-4o-latest",
          "max_tokens": 4096,
          "temperature": 0.7,
          "top_p": 0.9
        },
        "system_message": "You are a software engineer who breaks down a technical article for colleagues to read...",
        "user_message": "{{FirecrawlScrapeNode_1.markdown}}",
        "few_shot_examples": null,
        "url_variables": null
      },
      "coordinates": {
        "x": 1714,
        "y": 463.5
      },
      "dimensions": null,
      "subworkflow": null
    }
  ],
  "links": [
    {
      "source_id": "input_node",
      "target_id": "RouterNode_1",
      "source_handle": null,
      "target_handle": null
    }
  ]
}
```

Important guidelines:
1. Always create an input_node as the first node
2. Use appropriate node types based on the workflow purpose
3. Ensure all nodes are properly linked
4. Set reasonable coordinates for visual layout
5. Provide detailed configurations for each node
6. Return ONLY the workflow definition JSON (nodes and links) without any markdown or explanation
7. The workflow should be fully functional and ready to use
8. Choose appropriate LLM models for any AI-related tasks
9. Consider error handling and edge cases

The available node types include:
- InputNode: For user inputs
- SingleLLMCallNode: For LLM API calls
- PythonFunctionNode: For custom Python functions
- RouterNode: For conditional branching
- CoalesceNode: For merging paths
- FirecrawlScrapeNode: For web scraping
- SlackNotifyNode: For Slack notifications
- MarkdownNode: For displaying markdown content
- HTTPRequestNode: For making HTTP requests
"""

        # Prepare user message with user's requirements
        user_message = f"""Create a workflow for the following purpose:
{request.purpose}

Description:
{request.description}
"""

        if request.inputs:
            user_message += "\nInputs:\n"
            for key, value in request.inputs.items():
                user_message += f"- {key}: {value}\n"

        if request.outputs:
            user_message += "\nOutputs:\n"
            for key, value in request.outputs.items():
                user_message += f"- {key}: {value}\n"

        if request.advanced_options:
            user_message += "\nAdvanced Options:\n"
            for key, value in request.advanced_options.items():
                user_message += f"- {key}: {value}\n"

        # Call the LLM
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message}
        ]

        response = await generate_text(
            messages=messages,
            model_name="openai/chatgpt-4o-latest",
            temperature=0.2,
            max_tokens=16384,
            json_mode=True
        )

        # Try to parse the response
        try:
            # Clean up the response to ensure we get valid JSON
            cleaned_response = response.strip()
            json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', cleaned_response, re.DOTALL)
            if json_match:
                cleaned_response = json_match.group(1)

            # Parse the JSON
            workflow_definition = json.loads(cleaned_response)

            # Validate the workflow structure
            if "nodes" not in workflow_definition or "links" not in workflow_definition:
                raise ValueError("Generated workflow is missing required 'nodes' or 'links' fields")

            # Return the workflow definition
            return {
                "name": f"AI Generated: {request.purpose[:30]}{'...' if len(request.purpose) > 30 else ''}",
                "description": request.description,
                "definition": workflow_definition
            }
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse generated workflow JSON: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error processing generated workflow: {str(e)}")

    except Exception as e:
        logger.error(f"Workflow generation failed: {str(e)}")
        if response:
            truncated_response = response[:1000] + '...' if len(response) > 1000 else response
            logger.error(f"Raw LLM response (truncated): {truncated_response}")
        raise HTTPException(status_code=500, detail=f"Workflow generation failed: {str(e)}")

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
        # Get all available node types dynamically
        from .node_management import get_node_types
        available_node_types = await get_node_types()

        # Format node types for the prompt
        node_types_description = "The available node types include:\n"
        for category, nodes in available_node_types.items():
            node_types_description += f"\n{category}:\n"
            for node in nodes:
                node_types_description += f"- {node['name']}: {node['config']['title']}\n"

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
        "output_json_schema": "{\\"type\\":\\"object\\",\\"properties\\":{\\"blogpost_url\\":{\\"type\\":\\"string\\"},\\"paper_pdf_file\\":{\\"type\\":\\"string\\"}},\\"required\\":[\\"blogpost_url\\",\\"paper_pdf_file\\"]}",
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
        "model": "openai/o3",
        "instructions": "You are a skilled research assistant. Your task is to extract and summarize the key points from the provided blog post or paper. Focus on the main arguments, findings, and conclusions. Organize information clearly with bullet points or sections as appropriate.",
        "input_mapping": {
          "text": "{{$inputs.text}}"
        },
        "temperature": 0
      },
      "coordinates": {
        "x": 233,
        "y": 171
      },
      "dimensions": null,
      "subworkflow": null
    }
  ],
  "links": [
    {
      "source_id": "input_node",
      "target_id": "RouterNode_1",
      "source_port": "parent",
      "target_port": "parent"
    },
    {
      "source_id": "RouterNode_1",
      "target_id": "SingleLLMCallNode_1",
      "source_port": "route1",
      "target_port": "parent"
    }
  ]
}
```

Important guidelines:
1. Design the workflow to accomplish the user's purpose
2. Use the appropriate node types for specific tasks
3. Structure your JSON response with nodes and links
4. Include proper node configuration matching the schema
5. Ensure each node has a unique ID
6. Connect nodes with appropriate links
7. Provide a logical flow from inputs to outputs
8. Choose appropriate LLM models for any AI-related tasks
9. Consider error handling and edge cases
""" + f"""
{node_types_description}

IMPORTANT CONSTRAINTS:
1. ONLY use the node types listed above. Do not use any other node types not included in this list.
2. Each node must conform exactly to its schema as provided.
3. The workflow must be valid and executable with the given node types.
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

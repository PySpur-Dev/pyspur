import json
import re
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

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


class MessageGenerationRequest(BaseModel):
    description: str
    message_type: Literal["system", "user"]  # "system" or "user"
    existing_message: Optional[str] = None
    context: Optional[str] = None
    available_variables: Optional[List[str]] = None


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
        user_message = (
            f"Generate a JSON Schema for the following description:\n{request.description}"
        )

        if request.existing_schema:
            user_message += (
                f"\n\nPlease consider this existing schema as context:\n{request.existing_schema}"
            )
            user_message += (
                "\nModify it based on the description while preserving any compatible parts."
            )

        # Call the LLM
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ]

        response = await generate_text(
            messages=messages, model_name="openai/o3-mini", json_mode=True
        )

        # Try to parse the response in different ways
        try:
            # First try: direct JSON parse
            schema = json.loads(response)
            if isinstance(schema, dict) and "output" in schema:
                # If we got a wrapper object with an "output" key, extract the schema from it
                schema_str = schema["output"]
                # Extract JSON from potential markdown code blocks
                json_match = re.search(r"```json\s*(.*?)\s*```", schema_str, re.DOTALL)
                if json_match:
                    schema_str = json_match.group(1)
                schema = json.loads(schema_str)
        except json.JSONDecodeError:
            # Second try: Look for JSON in markdown code blocks
            json_match = re.search(r"```(?:json)?\s*(.*?)\s*```", response, re.DOTALL)
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
            truncated_response = response[:1000] + "..." if len(response) > 1000 else response
            logger.error(
                f"Schema generation failed. Raw response (truncated): {truncated_response}. Error: {str(e)}"
            )
        raise HTTPException(status_code=400, detail=str(e))


WORKFLOW_JSON_SCHEMA = """{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "parent_id": { "type": ["string", "null"] },
          "node_type": { "type": "string" },
          "coordinates": {
            "type": "object",
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" }
            },
            "required": ["x", "y"],
            "additionalProperties": false
          },
          "dimensions": {
            "type": ["object", "null"],
            "properties": {
              "width": { "type": "number" },
              "height": { "type": "number" }
            },
            "required": ["width", "height"],
            "additionalProperties": false
          },
          "subworkflow": {
            "type": ["object", "null"],
            "additionalProperties": false
          }
        },
        "required": [
          "id",
          "title",
          "parent_id",
          "node_type",
          "coordinates",
          "dimensions",
          "subworkflow"
        ],
        "additionalProperties": false
      }
    },
    "links": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source_id": { "type": "string" },
          "target_id": { "type": "string" },
          "source_port": { "type": "string" },
          "target_port": { "type": "string" }
        },
        "required": [
          "source_id",
          "target_id",
          "source_port",
          "target_port"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": ["nodes", "links"],
  "additionalProperties": false
}
"""


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
        system_message = (
            """You are an AI workflow architect expert. Your task is to create a complete pyspur workflow definition based on the user's requirements.

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
"""
            + f"""
{node_types_description}

IMPORTANT CONSTRAINTS:
1. ONLY use the node types listed above. Do not use any other node types not included in this list.
2. Each node must conform exactly to its schema as provided.
3. The workflow must be valid and executable with the given node types.
"""
        )

        # Prepare user message with user's requirements
        user_message = f"""Create a workflow for the following purpose:
{request.purpose}
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
            {"role": "user", "content": user_message},
        ]

        logger.info(f"Generating workflow with messages: {messages}")
        response = await generate_text(
            messages=messages,
            model_name="openai/o3-mini",
            json_mode=True,
            output_json_schema=WORKFLOW_JSON_SCHEMA,
        )
        logger.info(f"Generated workflow: {response}")

        # Try to parse the response
        try:
            # Clean up the response to ensure we get valid JSON
            cleaned_response = response.strip()
            json_match = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned_response, re.DOTALL)
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
                "definition": workflow_definition,
            }
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=400, detail=f"Failed to parse generated workflow JSON: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Error processing generated workflow: {str(e)}"
            )

    except Exception as e:
        logger.error(f"Workflow generation failed: {str(e)}")
        if response:
            truncated_response = response[:1000] + "..." if len(response) > 1000 else response
            logger.error(f"Raw LLM response (truncated): {truncated_response}")
        raise HTTPException(status_code=500, detail=f"Workflow generation failed: {str(e)}")


@router.post("/generate_message/")
async def generate_message(request: MessageGenerationRequest) -> Dict[str, str]:
    response: str = ""
    try:
        # Prepare the system message based on the message type
        if request.message_type == "system":
            system_message = """You are an expert at crafting effective system messages for AI assistants.
            Your task is to generate a clear, concise, and effective system message based on the provided description.

            # INSTRUCTIONS
            A good system message should:
            1. Clearly define the AI's role and purpose
            2. Set appropriate boundaries and constraints
            3. Provide necessary context and background information
            4. Be concise but comprehensive
            5. Use clear, unambiguous language
            6. Use XML tags when appropriate to structure information (e.g., <role>...</role>, <constraints>...</constraints>)

            # FORMAT REQUIREMENTS
            Your generated system message MUST include:
            1. An "# Instructions" section with clearly enumerated instructions (1., 2., 3., etc.)
            2. Clear organization with appropriate headings and structure

            # EXAMPLES
            Example 1 (Simple role definition):
            ```
            You are a helpful coding assistant that specializes in Python programming.

            # Instructions
            1. Provide accurate Python code examples when requested
            2. Explain coding concepts clearly and concisely
            3. Suggest best practices for Python development
            ```

            Example 2 (With XML tags):
            ```
            <role>You are a data analysis expert specialized in interpreting financial data.</role>

            # Instructions
            1. Only provide analysis based on the data provided
            2. Present findings with supporting evidence
            3. Identify trends and patterns in the data
            4. Suggest actionable insights when appropriate

            <constraints>Do not make assumptions about data you cannot see.</constraints>
            <format>Present your analysis with clear sections for Summary, Details, and Recommendations.</format>
            ```

            Return ONLY the system message text without any additional explanation or formatting.
            """
        elif request.message_type == "user":
            system_message = """You are an expert at crafting effective user prompts for AI assistants.
            Your task is to generate a clear, specific, and effective user prompt based on the provided description.

            # INSTRUCTIONS
            A good user prompt should:
            1. Clearly state what is being asked of the AI
            2. Provide necessary context and specific details
            3. Be structured in a way that guides the AI to produce the desired output
            4. Use clear, unambiguous language
            5. Include any relevant constraints or requirements
            6. Use XML tags when appropriate to structure information (e.g., <context>...</context>, <request>...</request>)

            # FORMAT REQUIREMENTS
            Your generated user prompt MUST include:
            1. An "# Instructions" section with clearly enumerated instructions (1., 2., 3., etc.)
            2. Clear organization with appropriate headings and structure

            # EXAMPLES
            Example 1 (Simple request):
            ```
            Explain how JavaScript promises work with code examples.

            # Instructions
            1. Explain the concept in simple terms first
            2. Provide practical code examples
            3. Include error handling patterns
            ```

            Example 2 (With XML tags):
            ```
            <context>I'm building a React application with a complex state management system.</context>

            <request>Review the following code snippet and suggest improvements for performance and readability:</request>

            <code>
            // Code would go here
            </code>

            # Instructions
            1. Identify performance bottlenecks in the code
            2. Suggest specific refactoring approaches
            3. Explain the reasoning behind each recommendation
            4. Provide example code for key improvements
            ```

            Return ONLY the user prompt text without any additional explanation or formatting.
            """
        else:
            raise ValueError(f"Unsupported message type: {request.message_type}")

        # Prepare the user message
        user_message = f"Generate a {request.message_type} message based on the following description:\n{request.description}"

        if request.existing_message:
            user_message += f"\n\nPlease consider this existing message as a starting point:\n{request.existing_message}"

        # Add context if provided
        if request.context:
            user_message += f"\n\nAdditional context:\n{request.context}"

        # Add information about available template variables if provided
        if request.available_variables and len(request.available_variables) > 0:
            variables_str = "\n".join([f"- {var}" for var in request.available_variables])

            if request.message_type == "system":
                user_message += f"\n\nThe message should appropriately incorporate the following template variables that the user has specifically selected for this message:\n{variables_str}\n\nThese variables will be replaced with actual values at runtime. Use them in the appropriate places to make the message dynamic and context-aware."
            else:  # user message
                user_message += f"\n\nThe prompt should appropriately incorporate the following template variables that the user has specifically selected for this message:\n{variables_str}\n\nThese variables will be replaced with actual values at runtime. Use them in the appropriate places to make the prompt dynamic and personalized."

            # Additional guidance on template variable usage
            user_message += "\n\nUse the variables in the format {{ variable_name }}. Only use the variables listed above - do not invent new variables."

        # Prepare messages for the LLM
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ]

        # Generate the message using OpenAI
        response = await generate_text(
            messages=messages,
            model_name="openai/o3-mini",
            temperature=0.7,
            max_tokens=1000,
        )

        # Process the response to extract the message
        message: str = ""
        if isinstance(response, str):
            if response.strip().startswith("{") and response.strip().endswith("}"):
                try:
                    parsed_response = json.loads(response)
                    if isinstance(parsed_response, dict) and "output" in parsed_response:
                        message = parsed_response["output"]
                    else:
                        message = response
                except json.JSONDecodeError:
                    message = response
            else:
                message = response

            # Remove any markdown code blocks if present
            if "```" in message:
                message = re.sub(r"```.*?```", "", message, flags=re.DOTALL).strip()
        else:
            # Fallback if response is not a string (shouldn't happen)
            message = str(response)

        return {"message": message}
    except Exception as e:
        logger.error(f"Error generating message: {str(e)}")
        if response:
            logger.error(f"Raw response: {response}")
        raise HTTPException(status_code=500, detail=f"Failed to generate message: {str(e)}")

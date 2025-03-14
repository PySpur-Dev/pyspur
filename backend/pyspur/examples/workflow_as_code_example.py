"""Example script demonstrating workflow-as-code capabilities.

This script shows how to create workflows programmatically using the WorkflowBuilder.
It includes examples of common workflow patterns.
"""

import json
import sys
from pathlib import Path

# Add the parent directory to the path so we can import pyspur
script_dir = Path(__file__).parent.parent.parent
sys.path.append(str(script_dir))

from pyspur.schemas.workflow_schemas import SpurType
from pyspur.workflow_builder import WorkflowBuilder


def create_simple_qa_workflow():
    """Create a simple question answering workflow with an LLM node."""
    builder = WorkflowBuilder(
        name="Simple QA Workflow",
        description="A simple workflow that takes a question and answers it using an LLM",
    )

    # Add nodes
    input_node = builder.add_node(
        node_type="InputNode",
        config={
            "output_schema": {"question": "string"},
            "output_json_schema": json.dumps(
                {"type": "object", "properties": {"question": {"type": "string"}}}
            ),
        },
    )

    llm_node = builder.add_node(
        node_type="SingleLLMCallNode",
        config={
            "llm_info": {
                "model": "openai/gpt-4o",
                "temperature": 0.7,
                "max_tokens": 1000,
            },
            "system_message": (
                "You are a helpful assistant who answers questions concisely and accurately."
            ),
            "user_message": "{{input_node.question}}",
        },
    )

    output_node = builder.add_node(
        node_type="OutputNode",
        config={
            "output_schema": {"answer": "string"},
            "output_json_schema": json.dumps(
                {"type": "object", "properties": {"answer": {"type": "string"}}}
            ),
            "output_map": {"answer": "llm_node.response"},
        },
    )

    # Connect nodes
    builder.add_link(input_node, llm_node)
    builder.add_link(llm_node, output_node)

    # Add test inputs
    builder.add_test_input({"question": "What is the capital of France?"})

    return builder.build()


def create_chatbot_workflow():
    """Create a chatbot workflow that maintains conversation history."""
    builder = WorkflowBuilder(
        name="Simple Chatbot",
        description=(
            "A chatbot that responds to user messages while maintaining conversation history"
        ),
    )

    # Set workflow type to chatbot
    builder.set_spur_type(SpurType.CHATBOT)

    # Add nodes
    input_node = builder.add_node(
        node_type="InputNode",
        config={
            "output_schema": {
                "user_message": "string",
                "session_id": "string",
                "message_history": "List[Dict[str, str]]",
            },
            "output_json_schema": json.dumps(
                {
                    "type": "object",
                    "properties": {
                        "user_message": {"type": "string"},
                        "session_id": {"type": "string"},
                        "message_history": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "role": {"type": "string"},
                                    "content": {"type": "string"},
                                },
                            },
                        },
                    },
                    "required": ["user_message", "session_id"],
                }
            ),
        },
    )

    llm_node = builder.add_node(
        node_type="SingleLLMCallNode",
        config={
            "llm_info": {
                "model": "anthropic/claude-3-haiku",
                "temperature": 0.7,
                "max_tokens": 1000,
            },
            "system_message": (
                "You are a helpful assistant. Respond in a friendly and concise manner."
            ),
            "user_message": "{{input_node.user_message}}",
            "message_history": "{{input_node.message_history}}",
        },
    )

    output_node = builder.add_node(
        node_type="OutputNode",
        config={
            "output_schema": {"assistant_message": "string"},
            "output_json_schema": json.dumps(
                {
                    "type": "object",
                    "properties": {"assistant_message": {"type": "string"}},
                    "required": ["assistant_message"],
                }
            ),
            "output_map": {"assistant_message": "llm_node.response"},
        },
    )

    # Connect nodes
    builder.add_link(input_node, llm_node)
    builder.add_link(llm_node, output_node)

    return builder.build()


def create_complex_routing_workflow():
    """Create a workflow with conditional routing based on a classifier."""
    builder = WorkflowBuilder(
        name="Content Classifier",
        description=(
            "A workflow that routes content to different processors based on classification"
        ),
    )

    # Add nodes
    input_node = builder.add_node(
        node_type="InputNode",
        config={
            "output_schema": {"content": "string"},
            "output_json_schema": json.dumps(
                {"type": "object", "properties": {"content": {"type": "string"}}}
            ),
        },
    )

    classifier_node = builder.add_node(
        node_type="SingleLLMCallNode",
        config={
            "llm_info": {
                "model": "openai/gpt-4o",
                "temperature": 0.2,
            },
            "system_message": (
                "You are a content classifier. Categorize the input content "
                "into one of these categories: question, statement, or request."
            ),
            "user_message": (
                "Classify the following text into one category (question, statement,"
                " or request):\n\n{{input_node.content}}\n\nProvide only the category"
                " name without any explanation."
            ),
        },
    )

    router_node = builder.add_node(
        node_type="RouterNode",
        config={
            "routes": [
                {"id": "question", "condition": "{{classifier_node.response == 'question'}}"},
                {"id": "statement", "condition": "{{classifier_node.response == 'statement'}}"},
                {"id": "request", "condition": "{{classifier_node.response == 'request'}}"},
                {"id": "default", "condition": "true"},
            ]
        },
    )

    question_handler = builder.add_node(
        node_type="SingleLLMCallNode",
        config={
            "llm_info": {
                "model": "openai/gpt-4o",
                "temperature": 0.7,
            },
            "system_message": "You are an expert at answering questions.",
            "user_message": "Here's a question I need you to answer:\n\n{{input_node.content}}",
        },
    )

    statement_handler = builder.add_node(
        node_type="SingleLLMCallNode",
        config={
            "llm_info": {
                "model": "openai/gpt-4o",
                "temperature": 0.7,
            },
            "system_message": "You are an expert at evaluating statements.",
            "user_message": (
                "Here's a statement. Please evaluate if it's true,"
                " false, or needs clarification:\n\n{{input_node.content}}"
            ),
        },
    )

    request_handler = builder.add_node(
        node_type="SingleLLMCallNode",
        config={
            "llm_info": {
                "model": "openai/gpt-4o",
                "temperature": 0.7,
            },
            "system_message": "You are an expert at handling requests.",
            "user_message": (
                "Here's a request. Please explain how I might fulfill it:\n\n{{input_node.content}}"
            ),
        },
    )

    default_handler = builder.add_node(
        node_type="SingleLLMCallNode",
        config={
            "llm_info": {
                "model": "openai/gpt-4o",
                "temperature": 0.7,
            },
            "system_message": "You are a general-purpose assistant.",
            "user_message": (
                "I couldn't determine the type of this content."
                " Please respond appropriately:\n\n{{input_node.content}}"
            ),
        },
    )

    coalesce_node = builder.add_node(
        node_type="CoalesceNode", config={"output_schema": {"response": "string"}}
    )

    output_node = builder.add_node(
        node_type="OutputNode",
        config={
            "output_schema": {"content": "string", "content_type": "string", "response": "string"},
            "output_map": {
                "content": "input_node.content",
                "content_type": "classifier_node.response",
                "response": "coalesce_node.response",
            },
        },
    )

    # Connect nodes
    builder.add_link(input_node, classifier_node)
    builder.add_link(classifier_node, router_node)

    # Connect router to handlers
    builder.add_link(source_id=router_node, target_id=question_handler, source_handle="question")
    builder.add_link(source_id=router_node, target_id=statement_handler, source_handle="statement")
    builder.add_link(source_id=router_node, target_id=request_handler, source_handle="request")
    builder.add_link(source_id=router_node, target_id=default_handler, source_handle="default")

    # Connect handlers to coalesce node
    builder.add_link(question_handler, coalesce_node)
    builder.add_link(statement_handler, coalesce_node)
    builder.add_link(request_handler, coalesce_node)
    builder.add_link(default_handler, coalesce_node)

    # Connect coalesce node to output
    builder.add_link(coalesce_node, output_node)

    # Add test inputs
    builder.add_test_input({"content": "What is the capital of France?"})
    builder.add_test_input({"content": "The sky is blue."})
    builder.add_test_input({"content": "Please find me a good restaurant."})

    return builder.build()


def main():
    """Create and save example workflows."""
    examples_dir = Path(__file__).parent / "workflow_examples"
    examples_dir.mkdir(exist_ok=True)

    # Create and save the simple QA workflow
    qa_workflow = create_simple_qa_workflow()
    with open(examples_dir / "simple_qa_workflow.json", "w") as f:
        json.dump(qa_workflow.model_dump(), f, indent=2)

    # Create and save the chatbot workflow
    chatbot_workflow = create_chatbot_workflow()
    with open(examples_dir / "chatbot_workflow.json", "w") as f:
        json.dump(chatbot_workflow.model_dump(), f, indent=2)

    # Create and save the complex routing workflow
    routing_workflow = create_complex_routing_workflow()
    with open(examples_dir / "complex_routing_workflow.json", "w") as f:
        json.dump(routing_workflow.model_dump(), f, indent=2)

    print(f"Example workflows saved to {examples_dir}")


if __name__ == "__main__":
    main()

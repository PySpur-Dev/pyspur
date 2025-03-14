"""Example script demonstrating how to create custom tools using the @tool_function decorator.

This script shows different ways to create and use custom tool functions in PySpur.
"""

import asyncio
import sys
from pathlib import Path
from typing import Any, Dict, List

# Add the parent directory to the path so we can import pyspur
script_dir = Path(__file__).parent.parent.parent
sys.path.append(str(script_dir))

from pydantic import BaseModel, Field

from pyspur.nodes.base import BaseNodeOutput
from pyspur.nodes.decorator import tool_function


# Basic tool function example
@tool_function(
    name="string_manipulation",
    display_name="String Manipulation Tool",
    description="A tool that performs various string manipulations",
    category="Text Processing",
)
def string_manipulator(text: str, operation: str = "uppercase") -> str:
    """Manipulate a string based on the specified operation.

    Args:
        text: The input text to manipulate
        operation: The operation to perform (uppercase, lowercase, capitalize, reverse)

    Returns:
        The manipulated string

    """
    if operation == "uppercase":
        return text.upper()
    elif operation == "lowercase":
        return text.lower()
    elif operation == "capitalize":
        return text.capitalize()
    elif operation == "reverse":
        return text[::-1]
    else:
        return f"Unknown operation: {operation}. Try uppercase, lowercase, capitalize, or reverse."


# Tool with a custom output model
class MathResult(BaseNodeOutput):
    """Custom output model for math operations."""

    result: float = Field(..., description="The result of the math operation")
    operation: str = Field(..., description="The operation that was performed")
    inputs: List[float] = Field(..., description="The inputs that were used in the operation")


@tool_function(
    name="math_operations",
    display_name="Math Operations Tool",
    description="A tool that performs basic math operations",
    category="Math",
    output_model=MathResult,  # Specify a custom output model
)
def math_tool(numbers: List[float], operation: str = "sum") -> Dict[str, Any]:
    """Perform a mathematical operation on a list of numbers.

    Args:
        numbers: A list of numbers to operate on
        operation: The operation to perform (sum, average, min, max, product)

    Returns:
        A dictionary containing the result, operation name, and input numbers

    """
    if not numbers:
        return {
            "result": 0.0,
            "operation": operation,
            "inputs": numbers,
        }

    if operation == "sum":
        result = sum(numbers)
    elif operation == "average":
        result = sum(numbers) / len(numbers)
    elif operation == "min":
        result = min(numbers)
    elif operation == "max":
        result = max(numbers)
    elif operation == "product":
        result = 1.0
        for num in numbers:
            result *= num
    else:
        result = 0.0
        operation = f"Unknown operation: {operation}"

    return {
        "result": result,
        "operation": operation,
        "inputs": numbers,
    }


# Tool with templated parameters that can access input values
@tool_function(
    name="template_example",
    display_name="Template Example Tool",
    description="A tool that demonstrates using Jinja2 templates in tool config",
    category="Examples",
    # Additional configuration parameters can be added here
    example_param="This is an example parameter",
)
def template_example(greeting: str, name: str) -> str:
    """Create a greeting message.

    Args:
        greeting: The greeting to use (e.g., "Hello", "Hi", "Hey")
        name: The name to greet

    Returns:
        A formatted greeting message

    """
    return f"{greeting}, {name}!"


# Tool that returns a Pydantic model converted to a dictionary
class WeatherData(BaseModel):
    """Weather data model."""

    temperature: float = Field(..., description="Temperature in Celsius")
    humidity: float = Field(..., description="Humidity percentage")
    conditions: str = Field(..., description="Weather conditions (e.g., sunny, rainy)")


@tool_function(
    name="weather_tool",
    display_name="Weather Tool",
    description="A tool that returns weather data for a location",
    category="Weather",
    # When returning a Pydantic model, convert it to a dictionary for the tool function
)
def weather_tool(location: str, units: str = "metric") -> Dict[str, Any]:
    """Get weather data for a location.

    Args:
        location: The location to get weather data for
        units: The units to use for temperature (metric or imperial)

    Returns:
        Weather data including temperature, humidity, and conditions

    """
    # In a real tool, this would make an API call to a weather service
    # This is a simplified example that returns mock data
    mock_data = {
        "New York": {"temperature": 22.5, "humidity": 65.0, "conditions": "Partly Cloudy"},
        "London": {"temperature": 18.0, "humidity": 80.0, "conditions": "Rainy"},
        "Tokyo": {"temperature": 28.0, "humidity": 70.0, "conditions": "Sunny"},
    }

    # Get data for the location or use default values
    location_data: dict[str, Any] = mock_data.get(
        location, {"temperature": 20.0, "humidity": 50.0, "conditions": "Unknown"}
    )

    # Apply temperature conversion if imperial units requested
    if units == "imperial":
        location_data["temperature"] = location_data["temperature"] * 9 / 5 + 32

    # Create the model and convert to dictionary
    weather = WeatherData(**location_data)
    return weather.model_dump()


def test_tools_directly():
    """Test the tool functions directly."""
    print("\n" + "=" * 50)
    print("TESTING TOOLS AS DIRECT FUNCTION CALLS")
    print("=" * 50)

    # Test string manipulator
    print("\nString Manipulator Tool:")
    result = string_manipulator("Hello, world!", "uppercase")
    print(f"  Function call with 'uppercase': {result}")
    result = string_manipulator("Hello, world!", "reverse")
    print(f"  Function call with 'reverse': {result}")

    # Test math tool
    print("\nMath Tool:")
    result = math_tool([1, 2, 3, 4, 5], "average")
    print(f"  Function call with 'average': {result}")
    result = math_tool([1, 2, 3, 4, 5], "product")
    print(f"  Function call with 'product': {result}")

    # Test template example
    print("\nTemplate Tool:")
    result = template_example("Hello", "PySpur User")
    print(f"  Function call: {result}")

    # Test weather tool
    print("\nWeather Tool:")
    result = weather_tool("Tokyo")
    print(f"  Function call for Tokyo (metric): {result}")
    result = weather_tool("London", "imperial")
    print(f"  Function call for London (imperial): {result}")


def test_tools_as_nodes():
    """Test the tool functions as nodes."""
    print("\n" + "=" * 50)
    print("TESTING TOOLS AS NODES")
    print("=" * 50)

    # Test string manipulator node
    print("\nString Manipulator Node:")
    # Create a configuration for the node
    config = string_manipulator.config_model()
    # Set parameters directly on the config object
    config = config.model_validate({"text": "Hello, world!", "operation": "uppercase"})

    # Create a node with the configuration
    node = string_manipulator.create_node(name="string_node", config=config)
    # Run the node
    result = asyncio.run(node(input={}))
    print(f"  Node execution result: {result.output}")  # type: ignore
    print(f"  Node class: {node.__class__.__name__}")
    print(f"  Node display name: {node.display_name}")
    print(f"  Node category: {node.category}")

    # Test math tool node with a custom output model
    print("\nMath Node (with custom output model):")
    config = math_tool.config_model()
    config = config.model_validate(
        {"numbers": [1, 2, 3, 4, 5], "operation": "product", "has_fixed_output": True}
    )

    node = math_tool.create_node(name="math_node", config=config)
    result = asyncio.run(node(input={}))
    print(f"  Node execution result: result={result.result}, operation={result.operation}")  # type: ignore
    print(f"  Inputs used: {result.inputs}")  # type: ignore

    # Test template tool with Jinja2 template rendering
    print("\nTemplate Node (with Jinja2 rendering):")
    config = template_example.config_model()
    config = config.model_validate(
        {"greeting": "Hello", "name": "{{ input.user_name }}", "has_fixed_output": True}
    )
    config.has_fixed_output = True

    node = template_example.create_node(name="template_node", config=config)
    # Provide input data that will be used to render the template
    result = asyncio.run(node(input={"user_name": "Template User"}))
    print(f"  Node execution result: {result.output}")  # type: ignore

    # Test weather tool node
    print("\nWeather Node:")
    config = weather_tool.config_model()
    config = config.model_validate(
        {"location": "New York", "units": "imperial", "has_fixed_output": True}
    )
    config.has_fixed_output = True

    node = weather_tool.create_node(name="weather_node", config=config)
    result = asyncio.run(node(input={}))
    print("  Node execution result:")
    for key, value in result.model_dump().items():
        if key != "output_json_schema":
            print(f"    {key}: {value}")


def examine_tool_metadata():
    """Examine metadata from the decorated tools."""
    print("\n" + "=" * 50)
    print("EXAMINING TOOL METADATA")
    print("=" * 50)

    # Examine string manipulator tool
    print("\nString Manipulator Tool Metadata:")
    print(f"  Tool function name: {string_manipulator.__name__}")  # type: ignore
    print(f"  Node class: {string_manipulator.node_class.__name__}")
    print(f"  Config model: {string_manipulator.config_model.__name__}")
    print(f"  Output model: {string_manipulator.output_model.__name__}")

    # Print config schema for math tool
    print("\nMath Tool Config Schema:")
    config_schema = math_tool.config_model.model_json_schema()
    print(f"  Required: {config_schema.get('required', [])}")
    print(f"  Properties: {list(config_schema.get('properties', {}).keys())}")

    # Print output schema for math tool
    print("\nMath Tool Output Schema:")
    output_schema = math_tool.output_model.model_json_schema()
    print(f"  Required: {output_schema.get('required', [])}")
    print(f"  Properties: {list(output_schema.get('properties', {}).keys())}")


def main():
    """Run the example demonstrations."""
    print("=" * 80)
    print("TOOL FUNCTION DECORATOR EXAMPLES")
    print("=" * 80)

    # Test tools directly as functions
    test_tools_directly()

    # Test tools as nodes
    test_tools_as_nodes()

    # Examine tool metadata
    examine_tool_metadata()

    print("\n" + "=" * 80)
    print("This example demonstrates how to create tools using the @tool_function decorator.")
    print("=" * 80)


if __name__ == "__main__":
    main()

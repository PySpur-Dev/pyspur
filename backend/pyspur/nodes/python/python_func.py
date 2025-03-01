from typing import Any, Dict, Type

from pydantic import BaseModel, Field, create_model

from ..base import Tool


class PythonFuncNodeOutput(BaseModel):
    """Output model for the Python function node."""

    pass


class PythonFuncNode(Tool):
    """Node type for executing Python code on the input data.
    """

    name: str = "python_func_node"
    output_model: Type[BaseModel] = PythonFuncNodeOutput

    # Configuration fields moved from PythonFuncNodeConfig
    code: str = Field(
        "\n".join(
            [
                "# Write your Python code here.",
                '# The input data is available as "input" pydantic model.',
                "# Return a dictionary of variables that you would like to see in the node output.",
            ]
        ),
        description="Python code to execute"
    )
    output_schema: Dict[str, Any] = Field(
        default_factory=dict,
        description="Schema for the output model"
    )

    def model_post_init(self, _: Any) -> None:
        """Initialize after Pydantic model initialization."""
        super().model_post_init(_)
        # Set display name
        self.display_name = "Python Function"

    def create_output_model_class(self, output_schema: Dict[str, Any]) -> Type[BaseModel]:
        """Create a Pydantic model class for the output based on the provided schema."""
        if not output_schema:
            return PythonFuncNodeOutput

        field_types = {}
        for field_name, field_type in output_schema.items():
            if field_type == "str":
                field_types[field_name] = (str, ...)
            elif field_type == "int":
                field_types[field_name] = (int, ...)
            elif field_type == "float":
                field_types[field_name] = (float, ...)
            elif field_type == "bool":
                field_types[field_name] = (bool, ...)
            elif field_type == "list":
                field_types[field_name] = (list, ...)
            elif field_type == "dict":
                field_types[field_name] = (dict, ...)
            else:
                field_types[field_name] = (Any, ...)

        return create_model(
            f"{self.name}_output",
            __base__=PythonFuncNodeOutput,
            __config__=None,
            __module__=self.__module__,
            __doc__=f"Output model for {self.name} node",
            __validators__=None,
            __cls_kwargs__=None,
            **field_types
        )

    async def run(self, input: BaseModel) -> BaseModel:
        self.output_model = self.create_output_model_class(self.output_schema)
        # Prepare the execution environment
        exec_globals: Dict[str, Any] = {}
        exec_locals: Dict[str, Any] = {}

        # Indent user code properly
        code_body = "\n".join("    " + line for line in self.code.split("\n"))

        # Build the code to execute
        function_code = f"def user_function(input_model):\n{code_body}\n"

        # Execute the user-defined function code
        exec(function_code, exec_globals, exec_locals)

        # Call the user-defined function and retrieve the output
        output_data = exec_locals["user_function"](input)
        return self.output_model.model_validate(output_data)


if __name__ == "__main__":
    import asyncio

    from pydantic import BaseModel, create_model

    # Create a test node
    node = PythonFuncNode(
        name="PythonFuncTest",
        code="\n".join(
            [
                "# Write your Python code here.",
                '# The input data is available as "input_model" pydantic model.',
                "# Return a dictionary of variables that you would like to see in the node output.",
                "output = input_model.Input.number ** 2",
                "return {'output': output}",
            ]
        ),
        output_schema={"output": "int"},
    )

    # Create test input
    class InputModel(BaseModel):
        number: int

    A = InputModel(number=5)
    input_data = {"Input": A}

    # Run the node
    output = asyncio.run(node(input_data))
    print(output)

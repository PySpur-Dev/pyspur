from typing import Any, Dict

from pydantic import Field

from ...schemas.workflow_schemas import WorkflowDefinitionSchema
from ..subworkflow.base_subworkflow_node import SubworkflowToolInput, SubworkflowToolOutput
from .base_loop_subworkflow_node import BaseLoopSubworkflowNode


class ForLoopNodeInput(SubworkflowToolInput):
    """Input model for the ForLoopNode."""

    pass


class ForLoopNodeOutput(SubworkflowToolOutput):
    """Output model for the ForLoopNode."""

    pass


class ForLoopNode(BaseLoopSubworkflowNode):
    """A node that executes a subworkflow a fixed number of times.
    
    The ForLoopNode executes a subworkflow repeatedly for a specified number of iterations.
    Each iteration's output becomes the input for the next iteration.
    """

    name: str = "for_loop"

    # Configuration parameters
    num_iterations: int = Field(
        default=1,
        title="Number of iterations",
        description="Number of times to execute the loop",
    )

    async def stopping_condition(self, input: Dict[str, Any]) -> bool:
        """Stop when we've reached the configured number of iterations"""
        return self.iteration >= self.num_iterations


if __name__ == "__main__":
    import asyncio
    from pprint import pprint

    from ...schemas.workflow_schemas import (
        WorkflowLinkSchema,
        WorkflowNodeSchema,
    )

    async def main():
        # Create a test subworkflow
        test_subworkflow = WorkflowDefinitionSchema(
            nodes=[
                WorkflowNodeSchema(
                    id="loop_input",
                    node_type="InputNode",
                    config={
                        "output_schema": {
                            "count": "int",
                            "loop_history": "dict",
                        },
                        "enforce_schema": False,
                    },
                ),
                WorkflowNodeSchema(
                    id="increment",
                    node_type="PythonFuncNode",
                    config={
                        "code": """
previous_outputs = input_model.loop_input.loop_history.get('increment', [])
running_total = sum(output['count'] for output in previous_outputs) if previous_outputs else 0  
running_total += input_model.loop_input.count + 1
return {
    'count': input_model.loop_input.count + 1,
    'running_total': running_total
}
""",
                        "output_schema": {
                            "count": "int",
                            "running_total": "int",
                        },
                    },
                ),
                WorkflowNodeSchema(
                    id="loop_output",
                    node_type="OutputNode",
                    config={
                        "output_map": {
                            "count": "increment.count",
                            "running_total": "increment.running_total",
                        },
                        "output_schema": {
                            "count": "int",
                            "running_total": "int",
                        },
                    },
                ),
            ],
            links=[
                WorkflowLinkSchema(
                    source_id="loop_input",
                    target_id="increment",
                ),
                WorkflowLinkSchema(
                    source_id="increment",
                    target_id="loop_output",
                ),
            ],
        )

        # Create the ForLoopNode
        node = ForLoopNode(
            name="test_loop",
            num_iterations=5,
            subworkflow=test_subworkflow,
        )

        # Create a test input
        class TestInput(ForLoopNodeInput):
            count: int = 0

        input_data = TestInput()
        output = await node(input_data)
        pprint(output)
        pprint(node.subworkflow_output)

    asyncio.run(main())

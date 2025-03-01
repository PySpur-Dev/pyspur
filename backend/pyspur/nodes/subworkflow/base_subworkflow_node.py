from abc import ABC
from typing import Any, Dict, Optional, Set, Type

from jinja2 import Template
from pydantic import BaseModel, Field

from ...execution.workflow_executor import WorkflowExecutor
from ...schemas.workflow_schemas import WorkflowNodeSchema
from ...utils.pydantic_utils import get_nested_field
from ..base import Tool, ToolInput, ToolOutput


class SubworkflowToolInput(ToolInput):
    """Base class for subworkflow tool inputs."""

    pass


class SubworkflowToolOutput(ToolOutput):
    """Base class for subworkflow tool outputs."""

    pass


class BaseSubworkflowNode(Tool, ABC):
    """Base class for all subworkflow nodes.
    
    A subworkflow node executes a nested workflow as part of a parent workflow.
    """

    name: str = "static_workflow_node"
    input_model: Type[BaseModel] = SubworkflowToolInput
    output_model: Type[BaseModel] = SubworkflowToolOutput

    # Configuration parameters
    input_map: Optional[Dict[str, str]] = Field(
        default=None,
        title="Input map",
        description="Map of input variables to subworkflow input fields expressed as Dict[<subworkflow_input_field>, <input_variable_path>]",
    )

    def setup(self) -> None:
        """Initialize the subworkflow node."""
        super().setup()

    def setup_subworkflow(self) -> None:
        """Set up the subworkflow structure for execution."""
        assert self._subworkflow is not None
        self._node_dict: Dict[str, WorkflowNodeSchema] = {
            node.id: node for node in self._subworkflow.nodes
        }
        self._dependencies: Dict[str, Set[str]] = self._build_dependencies()

        self._subworkflow_output_node = next(
            (node for node in self._subworkflow.nodes if node.node_type == "OutputNode")
        )

    def _build_dependencies(self) -> Dict[str, Set[str]]:
        """Build a dependency map for the subworkflow nodes."""
        assert self._subworkflow is not None
        dependencies: Dict[str, Set[str]] = {node.id: set() for node in self._subworkflow.nodes}
        for link in self._subworkflow.links:
            dependencies[link.target_id].add(link.source_id)
        return dependencies

    def _map_input(self, input: BaseModel) -> Dict[str, Any]:
        """Map input from parent workflow to subworkflow inputs."""
        if self.input_map == {} or self.input_map is None:
            return input.model_dump()
        mapped_input: Dict[str, Any] = {}
        for (
            subworkflow_input_field,
            input_var_path,
        ) in self.input_map.items():
            input_var = get_nested_field(input_var_path, input)
            mapped_input[subworkflow_input_field] = input_var
        return mapped_input

    def apply_templates_to_config(
        self, input_data: Dict[str, Any]
    ) -> None:
        """Apply templates to all config fields ending with _message"""
        updates: Dict[str, str] = {}
        for field_name, value in self.model_dump().items():
            if isinstance(value, str) and field_name.endswith("_message"):
                template = Template(value)
                updates[field_name] = template.render(**input_data)

        if updates:
            for field_name, value in updates.items():
                setattr(self, field_name, value)

    async def run(self, input: BaseModel) -> BaseModel:
        """Execute the subworkflow with the given input."""
        # Apply templates to config fields
        input_dict = input.model_dump()
        self.apply_templates_to_config(input_dict)

        self.setup_subworkflow()
        assert self._subworkflow is not None
        if self._subworkflow_output is None:
            self._subworkflow_output = {}
        mapped_input = self._map_input(input)
        workflow_executor = WorkflowExecutor(workflow=self._subworkflow, context=self._context)
        outputs = await workflow_executor.run(
            mapped_input, precomputed_outputs=self._subworkflow_output
        )
        self._subworkflow_output.update(outputs)

        # Create output model from the subworkflow output
        output_data = self._subworkflow_output[self._subworkflow_output_node.id]
        return self.output_model.model_validate(output_data)

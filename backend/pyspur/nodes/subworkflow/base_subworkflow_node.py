from abc import ABC
from typing import Any, Dict, Optional, Set

from jinja2 import Template
from pydantic import BaseModel, Field

from ...execution.workflow_executor import WorkflowExecutor
from ...schemas.workflow_schemas import WorkflowNodeSchema
from ...utils.pydantic_utils import get_nested_field
from ..base import BaseNode, BaseNodeConfig


class BaseSubworkflowNodeConfig(BaseNodeConfig):
    input_map: Optional[Dict[str, str]] = Field(
        default=None,
        title="Input map",
        description="Map of input variables to subworkflow input fields expressed as Dict[<subworkflow_input_field>, <input_variable_path>]",
    )


class BaseSubworkflowNode(BaseNode, ABC):
    name: str = "static_workflow_node"
    config_model = BaseSubworkflowNodeConfig

    def setup(self) -> None:
        super().setup()

    def setup_subworkflow(self) -> None:
        assert self.subworkflow is not None
        self._node_dict: Dict[str, WorkflowNodeSchema] = {
            node.id: node for node in self.subworkflow.nodes
        }
        self._dependencies: Dict[str, Set[str]] = self._build_dependencies()

        self._subworkflow_output_node = next(
            (node for node in self.subworkflow.nodes if node.node_type == "OutputNode")
        )

    def _build_dependencies(self) -> Dict[str, Set[str]]:
        assert self.subworkflow is not None
        dependencies: Dict[str, Set[str]] = {node.id: set() for node in self.subworkflow.nodes}
        for link in self.subworkflow.links:
            dependencies[link.target_id].add(link.source_id)
        return dependencies

    def _map_input(self, input: BaseModel) -> Dict[str, Any]:
        if self.config.input_map == {} or self.config.input_map is None:
            return input.model_dump()
        mapped_input: Dict[str, Any] = {}
        for (
            subworkflow_input_field,
            input_var_path,
        ) in self.config.input_map.items():
            input_var = get_nested_field(input_var_path, input)
            mapped_input[subworkflow_input_field] = input_var
        return mapped_input

    def apply_templates_to_config(
        self, model: BaseSubworkflowNodeConfig, input_data: Dict[str, Any]
    ) -> BaseSubworkflowNodeConfig:
        """Apply templates to all config fields ending with _message"""
        updates: Dict[str, str] = {}
        for field_name, value in model.model_dump().items():
            if isinstance(value, str) and field_name.endswith("_message"):
                template = Template(value)
                updates[field_name] = template.render(**input_data)
        if updates:
            return model.model_copy(update=updates)
        return model

    async def run(self, input: BaseModel) -> BaseModel:
        # Apply templates to config fields
        input_dict = input.model_dump()
        new_config = self.apply_templates_to_config(self.config, input_dict)
        self.update_config(new_config)

        self.setup_subworkflow()
        assert self.subworkflow is not None
        if self.subworkflow_output is None:
            self.subworkflow_output = {}
        mapped_input = self._map_input(input)
        workflow_executor = WorkflowExecutor(workflow=self.subworkflow, context=self.context)
        outputs = await workflow_executor.run(
            mapped_input, precomputed_outputs=self.subworkflow_output
        )
        self.subworkflow_output.update(outputs)
        return self.subworkflow_output[self._subworkflow_output_node.id]

from abc import abstractmethod
from typing import Any, Dict, List

from pydantic import BaseModel, create_model

from ...execution.workflow_executor import WorkflowExecutor
from ...schemas.workflow_schemas import WorkflowDefinitionSchema
from ..base import BaseNodeInput, BaseNodeOutput
from ..primitives.output import OutputNode
from ..subworkflow.base_subworkflow_node import (
    BaseSubworkflowNode,
    BaseSubworkflowNodeConfig,
)


class BaseLoopSubworkflowNodeConfig(BaseSubworkflowNodeConfig):
    subworkflow: WorkflowDefinitionSchema


class BaseLoopSubworkflowNodeInput(BaseNodeInput):
    pass


class BaseLoopSubworkflowNodeOutput(BaseNodeOutput):
    pass


class BaseLoopSubworkflowNode(BaseSubworkflowNode):
    name = "loop_subworkflow_node"
    config_model = BaseLoopSubworkflowNodeConfig
    iteration: int
    loop_outputs: Dict[str, List[Dict[str, Any]]]

    def setup(self) -> None:
        super().setup()
        self.loop_outputs = {}
        self.iteration = 0

    def _update_loop_outputs(self, iteration_output: Dict[str, Dict[str, Any]]) -> None:
        """Update the loop_outputs dictionary with the current iteration's output"""
        for node_id, node_outputs in iteration_output.items():
            # Skip storing the special loop_history field
            if "loop_history" in node_outputs:
                node_outputs = {k: v for k, v in node_outputs.items() if k != "loop_history"}

            if node_id not in self.loop_outputs:
                self.loop_outputs[node_id] = [node_outputs]
            else:
                self.loop_outputs[node_id].append(node_outputs)

    @abstractmethod
    async def stopping_condition(self, input: Dict[str, Any]) -> bool:
        """Determine whether to stop the loop based on the current input"""
        pass

    async def run_iteration(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Run a single iteration of the loop subworkflow"""
        self.subworkflow = self.config.subworkflow
        assert self.subworkflow is not None

        # Inject loop outputs into the input
        iteration_input = {**input, "loop_history": self.loop_outputs}

        # Execute the subworkflow
        self._executor = WorkflowExecutor(workflow=self.config.subworkflow, context=self.context)
        workflow_executor = self._executor
        outputs = await workflow_executor.run(iteration_input)

        # Convert outputs to dict format
        iteration_outputs = {node_id: output.model_dump() for node_id, output in outputs.items()}

        # Update loop outputs with this iteration's results
        self._update_loop_outputs(iteration_outputs)

        # Get the output node's results
        output_node = next(
            node for node in self.subworkflow.nodes if node.node_type == "OutputNode"
        )
        return iteration_outputs[output_node.id]

    async def run(self, input: BaseModel) -> BaseModel:
        """Execute the loop subworkflow until stopping condition is met"""
        current_input = self._map_input(input)

        # Run iterations until stopping condition is met
        while not await self.stopping_condition(current_input):
            iteration_output = await self.run_iteration(current_input)
            current_input.update(iteration_output)
            self.iteration += 1

        self.subworkflow_output = self.loop_outputs

        # create output model for the loop from the subworkflow output node's output_model
        output_node = next(
            node
            for _id, node in self._executor.node_instances.items()
            if issubclass(node.__class__, OutputNode)
        )
        self.output_model = create_model(
            f"{self.name}",
            **{name: (field, ...) for name, field in output_node.output_model.model_fields.items()},
            __base__=BaseLoopSubworkflowNodeOutput,
            __config__=None,
            __module__=self.__module__,
            __cls_kwargs__={"arbitrary_types_allowed": True},
            __doc__=None,
            __validators__=None,
        )

        # Return final state as BaseModel
        return self.output_model.model_validate(current_input)  # type: ignore

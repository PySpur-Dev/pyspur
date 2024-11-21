import asyncio
from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple

from pydantic import BaseModel

from ..execution.node_executor import NodeExecutor
from ..schemas.workflow_schemas import (
    WorkflowDefinitionSchema,
    WorkflowLinkSchema,
    WorkflowNodeSchema,
)
from ..execution.task_recorder import TaskRecorder, TaskStatus


class WorkflowExecutor:
    """
    Handles the execution of a workflow.
    """

    def __init__(
        self,
        workflow: WorkflowDefinitionSchema,
        task_recorder: Optional[TaskRecorder] = None,
    ):
        self.workflow = workflow
        self.task_recorder = task_recorder
        self._node_dict: Dict[str, WorkflowNodeSchema] = {}
        self._dependencies: Dict[str, Set[str]] = {}
        self._node_tasks: Dict[str, asyncio.Task[None]] = {}
        self._initial_inputs: Dict[str, Dict[str, Any]] = {}
        self._outputs: Dict[str, BaseModel] = {}
        self._build_node_dict()
        self._validate_links()
        self._build_dependencies()

    def _validate_links(self):
        """
        Validate that all links in the workflow are compatible.
        """
        for link in self.workflow.links:
            are_compatible, source_output_type, target_input_type = (
                self._are_link_types_compatible(link)
            )
            if not are_compatible:
                raise ValueError(
                    f"Link {link} is not compatible with the node types. Source output type: {source_output_type}, Target input type: {target_input_type}"
                )

    def _are_link_types_compatible(
        self, link: WorkflowLinkSchema
    ) -> Tuple[bool, Any, Any]:
        source_node = self._node_dict.get(link.source_id)
        target_node = self._node_dict.get(link.target_id)
        if source_node is None or target_node is None:
            return False, None, None

        source_node_executor = NodeExecutor(source_node)
        target_node_executor = NodeExecutor(target_node)

        source_output_type = (
            source_node_executor.node_instance.output_model.model_fields.get(
                link.source_output_key
            )
        )
        target_input_type = (
            target_node_executor.node_instance.input_model.model_fields.get(
                link.target_input_key
            )
        )
        if source_output_type is None or target_input_type is None:
            return False, source_output_type, target_input_type

        return (
            source_output_type.annotation == target_input_type.annotation,
            source_output_type,
            target_input_type,
        )

    def _build_node_dict(self):
        self._node_dict = {node.id: node for node in self.workflow.nodes}

    def _build_dependencies(self):
        dependencies: Dict[str, Set[str]] = {
            node.id: set() for node in self.workflow.nodes
        }
        for link in self.workflow.links:
            dependencies[link.target_id].add(link.source_id)
        self._dependencies = dependencies

    def _get_node_task(self, node_id: str) -> asyncio.Task[None]:
        if node_id in self._node_tasks:
            return self._node_tasks[node_id]
        # Start task for the node
        task = asyncio.create_task(self._execute_node(node_id))
        self._node_tasks[node_id] = task

        # Record task
        if self.task_recorder:
            self.task_recorder.create_task(node_id, {})
        return task

    async def _execute_node(self, node_id: str):
        node = self._node_dict[node_id]
        node_executor = NodeExecutor(node)

        # Wait for dependencies
        dependency_ids = self._dependencies.get(node_id, set())
        if dependency_ids:
            await asyncio.gather(
                *(self._get_node_task(dep_id) for dep_id in dependency_ids)
            )

        # Prepare inputs
        input_data_dict = self._prepare_node_input(node_id)
        node_input_data = node_executor.node_instance.input_model.model_validate(
            input_data_dict
        )

        # Update task recorder
        if self.task_recorder:
            self.task_recorder.update_task(
                node_id=node_id, status=TaskStatus.RUNNING, inputs=input_data_dict
            )
        # Execute node
        try:
            output = await node_executor(node_input_data)
        except Exception as e:
            if self.task_recorder:
                self.task_recorder.update_task(
                    node_id=node_id, status=TaskStatus.FAILED, end_time=datetime.now()
                )
            raise e

        # Update task recorder
        if self.task_recorder:
            self.task_recorder.update_task(
                node_id=node_id,
                status=TaskStatus.COMPLETED,
                outputs=output.model_dump(),
                end_time=datetime.now(),
            )
        # Store output
        self._outputs[node_id] = output

    def _prepare_node_input(self, node_id: str) -> Dict[str, Any]:
        input_data: Dict[str, Any] = {}

        # Collect inputs from source nodes
        for link in self.workflow.links:
            if link.target_id == node_id:
                source_output = self._outputs.get(link.source_id)
                if source_output is None:
                    raise ValueError(
                        f"Node '{link.source_id}' has not produced an output yet."
                    )
                source_value = getattr(source_output, link.source_output_key)
                input_data[link.target_input_key] = source_value

        # Include initial inputs if available
        if node_id in self._initial_inputs:
            initial_input: Dict[str, Any] = self._initial_inputs.get(node_id, {})
            input_data.update(initial_input)

        return input_data

    async def run(
        self, initial_inputs: Dict[str, Dict[str, Any]] = {}
    ) -> Dict[str, BaseModel]:
        if initial_inputs:
            self._initial_inputs = initial_inputs

        # Start tasks for all nodes
        for node_id in self._node_dict:
            self._get_node_task(node_id)

        # Wait for all tasks to complete
        await asyncio.gather(*self._node_tasks.values())

        return self._outputs

    async def __call__(
        self, initial_inputs: Dict[str, Dict[str, Any]] = {}
    ) -> Dict[str, BaseModel]:
        return await self.run(initial_inputs)

    async def run_partial(
        self,
        node_id: str,
        rerun_predecessors: bool = False,
        initial_inputs: Dict[str, Dict[str, Any]] = {},
        partial_outputs: Dict[str, Dict[str, Any]] = {},
    ) -> Dict[str, BaseModel]:
        if node_id not in self._node_dict:
            raise ValueError(f"Node {node_id} not found in the workflow.")

        if initial_inputs:
            self._initial_inputs = initial_inputs

        if partial_outputs:
            self._outputs = {
                node_id: NodeExecutor(
                    self._node_dict[node_id]
                ).node_instance.output_model.model_validate(partial_outputs[node_id])
                for node_id in partial_outputs.keys()
            }

        nodes_to_be_run: Set[str] = set()
        if rerun_predecessors:
            predecessor_ids = self._dependencies.get(node_id, set())
            for predecessor_id in predecessor_ids:
                if predecessor_id not in partial_outputs or predecessor_id == node_id:
                    self._outputs.pop(predecessor_id, None)
                    self._node_tasks.pop(predecessor_id, None)
                    nodes_to_be_run.add(predecessor_id)
        else:
            nodes_to_be_run = {node_id}

        for node_id in nodes_to_be_run:
            self._get_node_task(node_id)

        await asyncio.gather(
            *[self._node_tasks[node_id] for node_id in nodes_to_be_run]
        )

        return self._outputs

    async def run_batch(
        self, input_iterator: Iterator[Dict[str, Any]], batch_size: int = 100
    ) -> List[Dict[str, BaseModel]]:
        """
        Run the workflow on a batch of inputs.
        """
        results: List[Dict[str, BaseModel]] = []
        batch_tasks: List[asyncio.Task[Dict[str, BaseModel]]] = []
        for input_data in input_iterator:
            batch_tasks.append(asyncio.create_task(self.run(input_data)))
            if len(batch_tasks) == batch_size:
                results.extend(await asyncio.gather(*batch_tasks))
                batch_tasks = []
        if batch_tasks:
            results.extend(await asyncio.gather(*batch_tasks))

        return results

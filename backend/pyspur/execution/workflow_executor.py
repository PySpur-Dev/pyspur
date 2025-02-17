import asyncio
import traceback
from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple

from pydantic import ValidationError

from ..nodes.base import BaseNode, BaseNodeOutput
from ..nodes.factory import NodeFactory
from ..schemas.workflow_schemas import (
    WorkflowDefinitionSchema,
    WorkflowNodeSchema,
)
from .task_recorder import TaskRecorder, TaskStatus
from .workflow_execution_context import WorkflowExecutionContext


class UpstreamFailure(Exception):
    pass


class UnconnectedNode(Exception):
    pass


class WorkflowExecutor:
    """
    Handles the execution of a workflow.
    """

    def __init__(
        self,
        workflow: WorkflowDefinitionSchema,
        task_recorder: Optional[TaskRecorder] = None,
        context: Optional[WorkflowExecutionContext] = None,
    ):
        # Process subworkflows before initializing other attributes
        self.workflow = self._process_subworkflows(workflow)
        if task_recorder:
            self.task_recorder = task_recorder
        elif context and context.run_id and context.db_session:
            print("Creating task recorder from context")
            self.task_recorder = TaskRecorder(context.db_session, context.run_id)
        else:
            self.task_recorder = None
        self.context = context
        self._node_dict: Dict[str, WorkflowNodeSchema] = {}
        self.node_instances: Dict[str, BaseNode] = {}
        self._dependencies: Dict[str, Set[str]] = {}
        self._node_tasks: Dict[str, asyncio.Task[Optional[BaseNodeOutput]]] = {}
        self._initial_inputs: Dict[str, Dict[str, Any]] = {}
        self._outputs: Dict[str, Optional[BaseNodeOutput]] = {}
        self._failed_nodes: Set[str] = set()
        self._build_node_dict()
        self._build_dependencies()

    def _process_subworkflows(self, workflow: WorkflowDefinitionSchema) -> WorkflowDefinitionSchema:
        # Group nodes by parent_id
        nodes_by_parent: Dict[Optional[str], List[WorkflowNodeSchema]] = {}
        for node in workflow.nodes:
            parent_id = node.parent_id
            if parent_id not in nodes_by_parent:
                nodes_by_parent[parent_id] = []
            node_copy = node.model_copy(update={"parent_id": None})
            nodes_by_parent[parent_id].append(node_copy)

        # Get root level nodes (no parent)
        root_nodes = nodes_by_parent.get(None, [])

        # Process each parent node's children into subworkflows
        for parent_id, child_nodes in nodes_by_parent.items():
            if parent_id is None:
                continue

            # Find the parent node in root nodes
            parent_node = next((node for node in root_nodes if node.id == parent_id), None)
            if not parent_node:
                continue

            # Get links between child nodes
            child_node_ids = {node.id for node in child_nodes}
            subworkflow_links = [
                link
                for link in workflow.links
                if link.source_id in child_node_ids and link.target_id in child_node_ids
            ]

            # Create subworkflow
            subworkflow = WorkflowDefinitionSchema(nodes=child_nodes, links=subworkflow_links)

            # Update parent node's config with subworkflow
            parent_node.config = {
                **parent_node.config,
                "subworkflow": subworkflow.model_dump(),
            }

        # Return new workflow with only root nodes
        return WorkflowDefinitionSchema(
            nodes=root_nodes,
            links=[
                link
                for link in workflow.links
                if not any(
                    node.parent_id
                    for node in workflow.nodes
                    if node.id in (link.source_id, link.target_id)
                )
            ],
        )

    def _build_node_dict(self):
        self._node_dict = {node.id: node for node in self.workflow.nodes}

    def _build_dependencies(self):
        dependencies: Dict[str, Set[str]] = {node.id: set() for node in self.workflow.nodes}
        for link in self.workflow.links:
            dependencies[link.target_id].add(link.source_id)
        self._dependencies = dependencies

    def _get_source_handles(self) -> Dict[Tuple[str, str], str]:
        """Build a mapping of (source_id, target_id) -> source_handle for router nodes only"""
        source_handles: Dict[Tuple[str, str], str] = {}
        for link in self.workflow.links:
            source_node = self._node_dict[link.source_id]
            if source_node.node_type == "RouterNode":
                if not link.source_handle:
                    raise ValueError(
                        f"Missing source_handle in link from router node {link.source_id} to {link.target_id}"
                    )
                source_handles[(link.source_id, link.target_id)] = link.source_handle
        return source_handles

    def _get_async_task_for_node_execution(
        self, node_id: str
    ) -> asyncio.Task[Optional[BaseNodeOutput]]:
        if node_id in self._node_tasks:
            return self._node_tasks[node_id]
        # Start task for the node
        task = asyncio.create_task(self._execute_node(node_id))
        self._node_tasks[node_id] = task

        # Record task
        if self.task_recorder:
            self.task_recorder.create_task(node_id, {})
        return task

    async def _execute_node(self, node_id: str) -> Optional[BaseNodeOutput]:
        node = self._node_dict[node_id]
        node_input = {}
        try:
            if node_id in self._outputs:
                return self._outputs[node_id]

            # Check if any predecessor nodes failed
            dependency_ids = self._dependencies.get(node_id, set())

            # Wait for dependencies
            predecessor_outputs: List[Optional[BaseNodeOutput]] = []
            if dependency_ids:
                try:
                    predecessor_outputs = await asyncio.gather(
                        *(
                            self._get_async_task_for_node_execution(dep_id)
                            for dep_id in dependency_ids
                        ),
                    )
                except Exception:
                    raise UpstreamFailure(f"Node {node_id} skipped due to upstream failure")

            if any(dep_id in self._failed_nodes for dep_id in dependency_ids):
                print(f"Node {node_id} skipped due to upstream failure")
                self._failed_nodes.add(node_id)
                raise UpstreamFailure(f"Node {node_id} skipped due to upstream failure")

            if node.node_type != "CoalesceNode" and any(
                [output is None for output in predecessor_outputs]
            ):
                self._outputs[node_id] = None
                if self.task_recorder:
                    self.task_recorder.update_task(
                        node_id=node_id,
                        status=TaskStatus.CANCELED,
                        end_time=datetime.now(),
                    )
                return None

            # Get source handles mapping
            source_handles = self._get_source_handles()

            # Build node input, handling router outputs specially
            for dep_id, output in zip(dependency_ids, predecessor_outputs):
                predecessor_node = self._node_dict[dep_id]
                if predecessor_node.node_type == "RouterNode":
                    # For router nodes, we must have a source handle
                    source_handle = source_handles.get((dep_id, node_id))
                    if not source_handle:
                        raise ValueError(
                            f"Missing source_handle in link from router node {dep_id} to {node_id}"
                        )
                    # Get the specific route's output from the router
                    route_output = getattr(output, source_handle, None)
                    if route_output is not None:
                        node_input[dep_id] = route_output
                    else:
                        self._outputs[node_id] = None
                        if self.task_recorder:
                            self.task_recorder.update_task(
                                node_id=node_id,
                                status=TaskStatus.CANCELED,
                                end_time=datetime.now(),
                            )
                        return None
                else:
                    node_input[dep_id] = output

            # Special handling for InputNode - use initial inputs
            if node.node_type == "InputNode":
                node_input = self._initial_inputs.get(node_id, {})

            # Only fail early for None inputs if it is NOT a CoalesceNode
            if node.node_type != "CoalesceNode" and any([v is None for v in node_input.values()]):
                self._outputs[node_id] = None
                return None
            elif node.node_type == "CoalesceNode" and all([v is None for v in node_input.values()]):
                self._outputs[node_id] = None
                return None

            # Remove None values from input
            node_input = {k: v for k, v in node_input.items() if v is not None}

            # update task recorder with inputs
            if self.task_recorder:
                self.task_recorder.update_task(
                    node_id=node_id,
                    status=TaskStatus.RUNNING,
                    inputs={
                        dep_id: output.model_dump()
                        for dep_id, output in node_input.items()
                        if node.node_type != "InputNode"
                    },
                )

            # If node_input is empty, return None
            if not node_input:
                self._outputs[node_id] = None
                raise UnconnectedNode(f"Node {node_id} has no input")

            node_instance = NodeFactory.create_node(
                node_name=node.title,
                node_type_name=node.node_type,
                config=node.config,
            )
            self.node_instances[node_id] = node_instance
            # Update task recorder
            if self.task_recorder:
                self.task_recorder.update_task(
                    node_id=node_id,
                    status=TaskStatus.RUNNING,
                    subworkflow=node_instance.subworkflow,
                )

            # Execute node
            output = await node_instance(node_input)

            # Update task recorder
            if self.task_recorder:
                self.task_recorder.update_task(
                    node_id=node_id,
                    status=TaskStatus.COMPLETED,
                    outputs=output.model_dump(),
                    end_time=datetime.now(),
                    subworkflow=node_instance.subworkflow,
                    subworkflow_output=node_instance.subworkflow_output,
                )

            # Store output
            self._outputs[node_id] = output
            return output
        except UpstreamFailure as e:
            self._failed_nodes.add(node_id)
            self._outputs[node_id] = None
            if self.task_recorder:
                self.task_recorder.update_task(
                    node_id=node_id,
                    status=TaskStatus.CANCELED,
                    end_time=datetime.now(),
                    error="Upstream failure",
                )
            raise e
        except Exception as e:
            error_msg = (
                f"Node execution failed:\n"
                f"Node ID: {node_id}\n"
                f"Node Type: {node.node_type}\n"
                f"Node Title: {node.title}\n"
                f"Inputs: {node_input}\n"
                f"Error: {traceback.format_exc()}"
            )
            print(error_msg)
            self._failed_nodes.add(node_id)
            if self.task_recorder:
                self.task_recorder.update_task(
                    node_id=node_id,
                    status=TaskStatus.FAILED,
                    end_time=datetime.now(),
                    error=traceback.format_exc(limit=5),
                )
            raise e

    async def run(
        self,
        input: Dict[str, Any] = {},
        node_ids: List[str] = [],
        precomputed_outputs: Dict[str, Dict[str, Any] | List[Dict[str, Any]]] = {},
    ) -> Dict[str, BaseNodeOutput]:
        # Handle precomputed outputs first
        if precomputed_outputs:
            for node_id, output in precomputed_outputs.items():
                try:
                    if isinstance(output, dict):
                        self._outputs[node_id] = NodeFactory.create_node(
                            node_name=self._node_dict[node_id].title,
                            node_type_name=self._node_dict[node_id].node_type,
                            config=self._node_dict[node_id].config,
                        ).output_model.model_validate(output)
                    else:
                        # If output is a list of dicts, do not validate the output
                        # these are outputs of loop nodes, their precomputed outputs are not supported yet
                        continue

                except ValidationError as e:
                    print(
                        f"[WARNING]: Precomputed output validation failed for node {node_id}: {e}\n skipping precomputed output"
                    )
                except AttributeError as e:
                    print(
                        f"[WARNING]: Node {node_id} does not have an output_model defined: {e}\n skipping precomputed output"
                    )
                except KeyError as e:
                    print(
                        f"[WARNING]: Node {node_id} not found in the predecessor workflow: {e}\n skipping precomputed output"
                    )

        # Store input in initial inputs to be used by InputNode
        input_node = next(
            (
                node
                for node in self.workflow.nodes
                if node.node_type == "InputNode" and not node.parent_id
            ),
        )
        self._initial_inputs[input_node.id] = input
        # also update outputs for input node
        input_node_obj = NodeFactory.create_node(
            node_name=input_node.title,
            node_type_name=input_node.node_type,
            config=input_node.config,
        )
        self._outputs[input_node.id] = await input_node_obj(input)

        nodes_to_run = set(self._node_dict.keys())
        if node_ids:
            nodes_to_run = set(node_ids)

        # skip nodes that have parent nodes, as they will be executed as part of their parent node
        for node in self.workflow.nodes:
            if node.parent_id:
                nodes_to_run.discard(node.id)

        # drop outputs for nodes that need to be run
        for node_id in nodes_to_run:
            self._outputs.pop(node_id, None)

        # Start tasks for all nodes
        for node_id in nodes_to_run:
            self._get_async_task_for_node_execution(node_id)

        # Wait for all tasks to complete, but don't propagate exceptions
        results = await asyncio.gather(*self._node_tasks.values(), return_exceptions=True)

        # Process results to handle any exceptions
        for node_id, result in zip(self._node_tasks.keys(), results):
            if isinstance(result, Exception):
                print(f"Node {node_id} failed with error: {str(result)}")
                self._failed_nodes.add(node_id)
                self._outputs[node_id] = None

        # return the non-None outputs
        return {node_id: output for node_id, output in self._outputs.items() if output is not None}

    async def __call__(
        self,
        input: Dict[str, Any] = {},
        node_ids: List[str] = [],
        precomputed_outputs: Dict[str, Dict[str, Any] | List[Dict[str, Any]]] = {},
    ) -> Dict[str, BaseNodeOutput]:
        """
        Execute the workflow with the given input data.
        input: input for the input node of the workflow. Dict[<field_name>: <value>]
        node_ids: list of node_ids to run. If empty, run all nodes.
        precomputed_outputs: precomputed outputs for the nodes. These nodes will not be executed again.
        """
        return await self.run(input, node_ids, precomputed_outputs)

    async def run_batch(
        self, input_iterator: Iterator[Dict[str, Any]], batch_size: int = 100
    ) -> List[Dict[str, BaseNodeOutput]]:
        """
        Run the workflow on a batch of inputs.
        """
        results: List[Dict[str, BaseNodeOutput]] = []
        batch_tasks: List[asyncio.Task[Dict[str, BaseNodeOutput]]] = []
        for input in input_iterator:
            batch_tasks.append(asyncio.create_task(self.run(input)))
            if len(batch_tasks) == batch_size:
                results.extend(await asyncio.gather(*batch_tasks))
                batch_tasks = []
        if batch_tasks:
            results.extend(await asyncio.gather(*batch_tasks))
        return results


if __name__ == "__main__":
    workflow = WorkflowDefinitionSchema.model_validate(
        {
            "nodes": [
                {
                    "id": "input_node",
                    "title": "",
                    "node_type": "InputNode",
                    "config": {"output_schema": {"question": "string"}},
                    "coordinates": {"x": 281.25, "y": 128.75},
                },
                {
                    "id": "bon_node",
                    "title": "",
                    "node_type": "BestOfNNode",
                    "config": {
                        "samples": 1,
                        "output_schema": {
                            "response": "string",
                            "next_potential_question": "string",
                        },
                        "llm_info": {
                            "model": "gpt-4o",
                            "max_tokens": 16384,
                            "temperature": 0.7,
                            "top_p": 0.9,
                        },
                        "system_message": "You are a helpful assistant.",
                        "user_message": "",
                    },
                    "coordinates": {"x": 722.5, "y": 228.75},
                },
                {
                    "id": "output_node",
                    "title": "",
                    "node_type": "OutputNode",
                    "config": {
                        "title": "OutputNodeConfig",
                        "type": "object",
                        "output_schema": {
                            "question": "string",
                            "response": "string",
                        },
                        "output_map": {
                            "question": "bon_node.next_potential_question",
                            "response": "bon_node.response",
                        },
                    },
                    "coordinates": {"x": 1187.5, "y": 203.75},
                },
            ],
            "links": [
                {
                    "source_id": "input_node",
                    "target_id": "bon_node",
                },
                {
                    "source_id": "bon_node",
                    "target_id": "output_node",
                },
            ],
            "test_inputs": [
                {
                    "id": 1733466671014,
                    "question": "<p>Is altruism inherently selfish?</p>",
                }
            ],
        }
    )
    executor = WorkflowExecutor(workflow)
    input = {"question": "Is altruism inherently selfish?"}
    outputs = asyncio.run(executor(input))
    print(outputs)

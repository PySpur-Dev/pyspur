import asyncio
import traceback
from collections import defaultdict, deque
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, Iterator, List, Optional, Set, Tuple, Union

from pydantic import ValidationError

from ..models.run_model import RunModel, RunStatus
from ..models.task_model import TaskStatus
from ..models.user_session_model import MessageModel, SessionModel
from ..models.workflow_model import WorkflowModel
from ..nodes.base import BaseNode, BaseNodeOutput
from ..nodes.factory import NodeFactory
from ..nodes.logic.human_intervention import PauseException
from ..schemas.workflow_schemas import (
    SpurType,
    WorkflowDefinitionSchema,
    WorkflowNodeSchema,
)
from .task_recorder import TaskRecorder
from .workflow_execution_context import WorkflowExecutionContext

if TYPE_CHECKING:
    from .task_recorder import TaskRecorder


class UpstreamFailureError(Exception):
    pass


class UnconnectedNodeError(Exception):
    pass


class WorkflowExecutor:
    """Handles the execution of a workflow."""

    def __init__(
        self,
        workflow: Union[WorkflowModel, WorkflowDefinitionSchema],
        initial_inputs: Optional[Dict[str, Dict[str, Any]]] = None,
        task_recorder: Optional["TaskRecorder"] = None,
        context: Optional[WorkflowExecutionContext] = None,
        resumed_node_ids: Optional[List[str]] = None,
    ):
        # Convert WorkflowModel to WorkflowDefinitionSchema if needed
        if isinstance(workflow, WorkflowModel):
            self.workflow = WorkflowDefinitionSchema.model_validate(workflow.definition)
        else:
            self.workflow = self._process_subworkflows(workflow)
        self._initial_inputs = initial_inputs or {}
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
        self._outputs: Dict[str, Optional[BaseNodeOutput]] = {}
        self._failed_nodes: Set[str] = set()
        self._resumed_node_ids: Set[str] = set(resumed_node_ids or [])
        self._build_node_dict()
        self._build_dependencies()

    @property
    def outputs(self) -> Dict[str, Optional[BaseNodeOutput]]:
        """Get the current outputs of the workflow execution."""
        return self._outputs

    @outputs.setter
    def outputs(self, value: Dict[str, Optional[BaseNodeOutput]]):
        """Set the outputs of the workflow execution."""
        self._outputs = value

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
            test_inputs=workflow.test_inputs,
            spur_type=workflow.spur_type,
        )

    def _build_node_dict(self):
        self._node_dict = {node.id: node for node in self.workflow.nodes}

    def _build_dependencies(self):
        dependencies: Dict[str, Set[str]] = {node.id: set() for node in self.workflow.nodes}
        for link in self.workflow.links:
            dependencies[link.target_id].add(link.source_id)
        self._dependencies = dependencies

    def _get_source_handles(self) -> Dict[Tuple[str, str], str]:
        """Build a mapping of (source_id, target_id) -> source_handle for router nodes only."""
        source_handles: Dict[Tuple[str, str], str] = {}
        for link in self.workflow.links:
            source_node = self._node_dict[link.source_id]
            if source_node.node_type == "RouterNode":
                if not link.source_handle:
                    raise ValueError(
                        f"Missing source_handle in link from router node "
                        f"{link.source_id} to {link.target_id}"
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

    def get_blocked_nodes(self, paused_node_id: str) -> Set[str]:
        """Find all nodes that are blocked by the paused node.

        These are nodes that directly or indirectly depend on the paused node.

        Args:
            paused_node_id: The ID of the node that is paused

        Returns:
            Set of node IDs that are blocked by the paused node

        """
        blocked_nodes: Set[str] = set()

        # Build a dependency graph (which nodes depend on which)
        dependents: Dict[str, Set[str]] = defaultdict(set)
        for node_id, deps in self._dependencies.items():
            for dep_id in deps:
                dependents[dep_id].add(node_id)

        # Start with the paused node and find all nodes that depend on it
        queue: deque[str] = deque([paused_node_id])
        visited: Set[str] = set()

        while queue:
            current_node_id: str = queue.popleft()
            visited.add(current_node_id)

            # Get all nodes that depend on this node
            for dependent in dependents.get(current_node_id, set()):
                if dependent not in visited:
                    blocked_nodes.add(dependent)
                    queue.append(dependent)

        return blocked_nodes

    def is_downstream_of_pause(self, node_id: str) -> bool:
        """Check if a node is downstream of any paused node.

        Args:
            node_id: The ID of the node to check

        Returns:
            True if the node is downstream of a paused node, False otherwise

        """
        # If this node is being resumed, it's not considered downstream of a pause
        if node_id in self._resumed_node_ids:
            return False

        # Check if we have paused nodes in the workflow
        paused_nodes: Set[str] = set()
        if self.task_recorder:
            # Find paused nodes from tasks
            for task in self.task_recorder.tasks.values():
                # Only consider nodes that are still paused and not being resumed
                if task.status == TaskStatus.PAUSED and task.node_id not in self._resumed_node_ids:
                    paused_nodes.add(task.node_id)

        if not paused_nodes:
            return False

        # Check if this node is downstream of any paused node
        for paused_node_id in paused_nodes:
            if _workflow_definition := getattr(self.context, "workflow_definition", None):
                blocked_nodes = self.get_blocked_nodes(paused_node_id)
                if node_id in blocked_nodes:
                    return True

        return False

    def _get_workflow_definition(self) -> Dict[str, Any]:
        """Get workflow definition from context."""
        return getattr(self.context, "workflow_definition", {}) or {}

    def _get_message_history(self, session_id: str) -> List[Dict[str, str]]:
        """Extract message history from a session.

        For chatbot workflows, this extracts the history of user and assistant messages
        from the session's message history.
        """
        if not self.context or not self.context.db_session:
            return []

        # Query the session and its messages
        session = (
            self.context.db_session.query(SessionModel)
            .filter(SessionModel.id == session_id)
            .first()
        )

        if not session:
            return []

        history: List[Dict[str, Any]] = []
        for message in session.messages:
            history.append(message.content)

        return history

    def _store_message_history(
        self, session_id: str, user_message: str, assistant_message: str
    ) -> None:
        """Store the current turn's messages in the session history."""
        if not self.context or not self.context.db_session:
            return

        # Create user message
        user_msg = MessageModel(
            session_id=session_id,
            run_id=self.context.run_id if self.context else None,
            content={"role": "user", "content": user_message},
        )
        self.context.db_session.add(user_msg)

        # Create assistant message
        assistant_msg = MessageModel(
            session_id=session_id,
            run_id=self.context.run_id if self.context else None,
            content={"role": "assistant", "content": assistant_message},
        )
        self.context.db_session.add(assistant_msg)
        self.context.db_session.commit()

    def _mark_node_as_paused(
        self, node_id: str, pause_output: Optional[BaseNodeOutput] = None
    ) -> None:
        """Mark a node as paused and store its output."""
        # Store the output
        self._outputs[node_id] = pause_output

        # Update the task recorder if available
        if self.task_recorder:
            self.task_recorder.update_task(
                node_id=node_id,
                status=TaskStatus.PAUSED,
                end_time=datetime.now(),
                outputs=self._serialize_output(pause_output) if pause_output else None,
            )

    def _mark_downstream_nodes_as_pending(self, paused_node_id: str) -> Set[str]:
        """Mark all downstream nodes of a paused node as pending."""
        # Use explicit typing to satisfy the linter
        blocked_nodes: Set[str] = self.get_blocked_nodes(paused_node_id)

        # Record for the return value
        all_updated_nodes = set(blocked_nodes)

        # Update tasks if we have a recorder
        if self.task_recorder:
            current_time = datetime.now()
            for blocked_node_id in blocked_nodes:
                self.task_recorder.update_task(
                    node_id=blocked_node_id,
                    status=TaskStatus.PENDING,
                    end_time=current_time,
                    is_downstream_of_pause=True,
                )

                # Remove from failed nodes if necessary
                if blocked_node_id in self._failed_nodes:
                    self._failed_nodes.remove(blocked_node_id)

        return all_updated_nodes

    def _update_run_status_to_paused(self) -> None:
        """Update the run status to paused in the database."""
        if self.context is None:
            return

        if self.context.db_session is None:
            return

        if not hasattr(self.context, "run_id"):
            return

        run = (
            self.context.db_session.query(RunModel)
            .filter(RunModel.id == self.context.run_id)
            .first()
        )

        if run:
            run.status = RunStatus.PAUSED
            # Note: We don't commit immediately - caller should commit when all updates are done

    def _handle_pause_exception(self, node_id: str, pause_exception: PauseException) -> None:
        """Handle a pause exception for a node."""
        # Mark the node as paused
        self._mark_node_as_paused(node_id, pause_exception.output)

        # Mark downstream nodes as pending
        self._mark_downstream_nodes_as_pending(node_id)

        # Update run status
        self._update_run_status_to_paused()

        # Commit all changes at once
        if (
            self.context is not None
            and hasattr(self.context, "db_session")
            and self.context.db_session is not None
        ):
            self.context.db_session.commit()

    def _get_tasks_to_update(self, run: RunModel) -> List[str]:
        """Get list of task IDs that need to be updated from CANCELED to PENDING."""
        # Find all downstream nodes of any paused node
        all_blocked_nodes: Set[str] = set()
        for task in run.tasks:
            if task.status == TaskStatus.PAUSED:
                blocked_nodes = self.get_blocked_nodes(task.node_id)
                all_blocked_nodes.update(blocked_nodes)

        # Return tasks that are CANCELED but should be PENDING
        return [
            task.node_id
            for task in run.tasks
            if task.status == TaskStatus.CANCELED and task.node_id in all_blocked_nodes
        ]

    def _fix_canceled_tasks_after_pause(self, paused_node_id: str) -> None:
        """Fix any tasks that were incorrectly marked as CANCELED."""
        if not all([self.task_recorder, self.context, hasattr(self.context, "run_id")]):
            return

        assert self.context is not None

        if not hasattr(self.context, "db_session") or self.context.db_session is None:
            return

        run = (
            self.context.db_session.query(RunModel)
            .filter(RunModel.id == self.context.run_id)
            .first()
        )
        if not run:
            return

        tasks_to_update = self._get_tasks_to_update(run)
        if tasks_to_update:
            current_time = datetime.now()
            for node_id in tasks_to_update:
                if self.task_recorder:
                    self.task_recorder.update_task(
                        node_id=node_id,
                        status=TaskStatus.PENDING,
                        end_time=current_time,
                        is_downstream_of_pause=True,
                    )
            self.context.db_session.commit()

    async def _execute_node(self, node_id: str) -> Optional[BaseNodeOutput]:  # noqa: C901
        node = self._node_dict[node_id]
        node_input = {}
        try:
            if node_id in self._outputs:
                return self._outputs[node_id]

            # Check if this node already has a completed task
            if self.task_recorder and node_id in self.task_recorder.tasks:
                task = self.task_recorder.tasks[node_id]
                if task.status == TaskStatus.COMPLETED and task.outputs:
                    # If the node already has a completed task, use its outputs
                    try:
                        # Create a node instance to get the output model
                        node_instance = NodeFactory.create_node(
                            node_name=node.title,
                            node_type_name=node.node_type,
                            config=node.config,
                        )
                        node_output = node_instance.output_model.model_validate(task.outputs)
                        self._outputs[node_id] = node_output
                        return node_output
                    except Exception as e:
                        print(f"Error validating outputs for completed task {node_id}: {e}")
                        # Continue with normal execution if validation fails

            # Check if this node is downstream of any paused nodes
            if self.is_downstream_of_pause(node_id):
                if self.task_recorder:
                    self.task_recorder.update_task(
                        node_id=node_id, status=TaskStatus.PENDING, end_time=datetime.now()
                    )
                return None

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
                except Exception as e:
                    raise UpstreamFailureError(
                        f"Node {node_id} skipped due to upstream failure"
                    ) from e

            if any(dep_id in self._failed_nodes for dep_id in dependency_ids):
                print(f"Node {node_id} skipped due to upstream failure")
                self._failed_nodes.add(node_id)
                raise UpstreamFailureError(f"Node {node_id} skipped due to upstream failure")

            # Before checking for None outputs, check if any dependencies are paused
            has_paused_dependencies = False
            if self.task_recorder:
                for dep_id in dependency_ids:
                    task = self.task_recorder.tasks.get(dep_id)
                    if task and task.status == TaskStatus.PAUSED:
                        has_paused_dependencies = True
                        break

            # If a dependency is paused, mark this node as PENDING instead of CANCELED
            if has_paused_dependencies:
                self._outputs[node_id] = None
                if self.task_recorder:
                    self.task_recorder.update_task(
                        node_id=node_id,
                        status=TaskStatus.PENDING,
                        end_time=datetime.now(),
                        is_downstream_of_pause=True,
                    )
                return None

            if node.node_type != "CoalesceNode" and any(
                output is None for output in predecessor_outputs
            ):
                self._outputs[node_id] = None
                if self.task_recorder:
                    # Check if any dependencies are paused before marking as CANCELED
                    has_paused_dependencies = False
                    for dep_id in dependency_ids:
                        task = self.task_recorder.tasks.get(dep_id)
                        if task and task.status == TaskStatus.PAUSED:
                            has_paused_dependencies = True
                            break

                    if has_paused_dependencies:
                        self.task_recorder.update_task(
                            node_id=node_id,
                            status=TaskStatus.PENDING,
                            end_time=datetime.now(),
                            is_downstream_of_pause=True,
                        )
                    else:
                        self.task_recorder.update_task(
                            node_id=node_id,
                            status=TaskStatus.CANCELED,
                            end_time=datetime.now(),
                        )
                return None

            # Get source handles mapping
            source_handles = self._get_source_handles()

            # Build node input, handling router outputs specially
            for dep_id, output in zip(dependency_ids, predecessor_outputs, strict=False):
                if output is None:
                    continue
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
                        node_input[predecessor_node.title] = route_output
                    else:
                        self._outputs[node_id] = None
                        if self.task_recorder:
                            self.task_recorder.update_task(
                                node_id=node_id,
                                status=TaskStatus.CANCELED,
                                end_time=datetime.now(),
                            )
                        return None
                elif predecessor_node.node_type == "HumanInterventionNode":
                    # Ensure the output is stored with the correct node ID
                    if hasattr(output, "model_dump"):
                        # Get a dictionary representation of the output to examine its structure
                        output_dict = output.model_dump()
                        # Special transformation for
                        # HumanInterventionNode - modify node_input directly
                        #
                        # This ensures downstream nodes can access by node ID
                        # like {{HumanInterventionNode_1.input_node.input_1}}
                        #
                        # Store the raw output data directly in the node_input
                        # using dep_id as the key
                        node_input[predecessor_node.title] = output_dict
                else:
                    node_input[predecessor_node.title] = output

            # Special handling for InputNode - use initial inputs
            if node.node_type == "InputNode":
                node_input = self._initial_inputs.get(node_id, {})

            # Only fail early for None inputs if it is NOT a CoalesceNode
            if node.node_type != "CoalesceNode" and any(v is None for v in node_input.values()):
                self._outputs[node_id] = None
                return None
            elif node.node_type == "CoalesceNode" and all(v is None for v in node_input.values()):
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
                        dep_id: output.model_dump() if hasattr(output, "model_dump") else output
                        for dep_id, output in node_input.items()
                        if node.node_type != "InputNode"
                    },
                )

            # If node_input is empty, return None
            if not node_input:
                self._outputs[node_id] = None
                raise UnconnectedNodeError(f"Node {node_id} has no input")

            node_instance = NodeFactory.create_node(
                node_name=node.title,
                node_type_name=node.node_type,
                config=node.config,
            )
            self.node_instances[node_id] = node_instance

            # Set workflow definition in node context if available
            if hasattr(node_instance, "context"):
                node_instance.context = WorkflowExecutionContext(
                    workflow_id=self.context.workflow_id if self.context else "",
                    run_id=self.context.run_id if self.context else "",
                    parent_run_id=self.context.parent_run_id if self.context else None,
                    run_type=self.context.run_type if self.context else "interactive",
                    db_session=self.context.db_session if self.context else None,
                    workflow_definition=self.workflow.model_dump(),
                )

            try:
                output = await node_instance(node_input)

                # Update task recorder
                if self.task_recorder:
                    self.task_recorder.update_task(
                        node_id=node_id,
                        status=TaskStatus.COMPLETED,
                        outputs=self._serialize_output(output),
                        end_time=datetime.now(),
                        subworkflow=node_instance.subworkflow,
                        subworkflow_output=node_instance.subworkflow_output,
                    )

                # Store output
                self._outputs[node_id] = output
                return output
            except PauseException as e:
                self._handle_pause_exception(node_id, e)
                # Return None to prevent downstream execution
                return None

        except UpstreamFailureError as e:
            self._failed_nodes.add(node_id)
            self._outputs[node_id] = None
            if self.task_recorder:
                current_time = datetime.now()

                # Check if this node is downstream of a paused node
                has_paused_upstream = False
                if hasattr(self, "context") and self.context:
                    # Find any paused nodes
                    paused_node_ids: List[str] = []
                    for _, task in self.task_recorder.tasks.items():
                        if task.status == TaskStatus.PAUSED:
                            paused_node_ids.append(task.node_id)

                    # Check if this node is blocked by any paused node
                    for paused_node_id in paused_node_ids:
                        blocked_nodes = self.get_blocked_nodes(paused_node_id)
                        if node_id in blocked_nodes:
                            has_paused_upstream = True
                            break

                if has_paused_upstream:
                    self.task_recorder.update_task(
                        node_id=node_id,
                        status=TaskStatus.PENDING,
                        end_time=current_time,
                        error=None,
                        is_downstream_of_pause=True,
                    )
                else:
                    self.task_recorder.update_task(
                        node_id=node_id,
                        status=TaskStatus.CANCELED,
                        end_time=current_time,
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
                current_time = datetime.now()
                self.task_recorder.update_task(
                    node_id=node_id,
                    status=TaskStatus.FAILED,
                    end_time=current_time,
                    error=traceback.format_exc(limit=5),
                )
            raise e

    def _serialize_output(self, output: Optional[BaseNodeOutput]) -> Optional[Dict[str, Any]]:
        """Serialize node outputs, handling datetime objects."""
        if output is None:
            return None

        data = output.model_dump()

        def _serialize_value(val: Any) -> Any:
            """Recursively serialize values, handling datetime objects and sets."""
            if isinstance(val, datetime):
                return val.isoformat()
            elif isinstance(val, set):
                return list(val)  # type: ignore # Convert sets to lists
            elif isinstance(val, dict):
                return {str(key): _serialize_value(value) for key, value in val.items()}  # type: ignore
            elif isinstance(val, list):
                return [_serialize_value(item) for item in val]  # type: ignore
            return val

        return {str(key): _serialize_value(value) for key, value in data.items()}

    async def _execute_workflow(  # noqa: C901
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
                        # these are outputs of loop nodes,
                        # their precomputed outputs are not supported yet
                        continue

                except ValidationError as e:
                    print(
                        f"[WARNING]: Precomputed output validation failed for node {node_id}: "
                        f"{e}\n skipping precomputed output"
                    )
                except AttributeError as e:
                    print(
                        f"[WARNING]: Node {node_id} does not have an output_model defined: "
                        f"{e}\n skipping precomputed output"
                    )
                except KeyError as e:
                    print(
                        f"[WARNING]: Node {node_id} not found in the predecessor workflow: "
                        f"{e}\n skipping precomputed output"
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
        paused_node_id: Optional[str] = None
        paused_exception: Optional[PauseException] = None
        for node_id, result in zip(self._node_tasks.keys(), results, strict=False):
            if isinstance(result, PauseException):
                # Handle pause state - don't mark as failed
                paused_node_id = result.node_id
                paused_exception = result
                print(f"Node {node_id} paused: {str(result)}")
                # Don't add to failed nodes since this is a pause state
                continue
            elif isinstance(result, Exception):
                print(f"Node {node_id} failed with error: {str(result)}")
                if paused_node_id and self.task_recorder:
                    # Check if this node is downstream of the paused node
                    is_downstream = False
                    current_node = node_id
                    while current_node in self._dependencies:
                        deps = self._dependencies[current_node]
                        if paused_node_id in deps:
                            is_downstream = True
                            break
                        # Check next level of dependencies
                        if not deps:
                            break
                        current_node = next(iter(deps))

                    if is_downstream:
                        # Update task status without marking as failed
                        self.task_recorder.update_task(
                            node_id=node_id,
                            status=TaskStatus.PENDING,
                            end_time=datetime.now(),
                            is_downstream_of_pause=True,
                        )
                        continue

                self._failed_nodes.add(node_id)
                self._outputs[node_id] = None

        # Handle any downstream nodes of paused nodes that might not have been processed yet
        if paused_node_id is not None and self.task_recorder:
            self._mark_downstream_nodes_as_pending(paused_node_id)

        # Final pass: fix any CANCELED tasks that should be PENDING
        if paused_node_id is not None:
            self._fix_canceled_tasks_after_pause(paused_node_id)

        # Ensure workflow status is updated to PAUSED if any node is paused
        if paused_node_id is not None:
            self._update_run_status_to_paused()
            # Commit all database changes
            if (
                self.context is not None
                and hasattr(self.context, "db_session")
                and self.context.db_session is not None
            ):
                self.context.db_session.commit()

        # If we have a paused node, re-raise the pause exception
        if paused_exception is not None:
            # This must be raised for API endpoints to catch it
            raise paused_exception

        # return the non-None outputs
        return {node_id: output for node_id, output in self._outputs.items() if output is not None}

    async def run(
        self,
        input: Dict[str, Any] = {},
        node_ids: List[str] = [],
        precomputed_outputs: Dict[str, Dict[str, Any] | List[Dict[str, Any]]] = {},
    ) -> Dict[str, BaseNodeOutput]:
        # For chatbot workflows, extract and inject message history
        if self.workflow.spur_type == SpurType.CHATBOT:
            session_id = input.get("session_id")
            user_message = input.get("user_message")
            message_history = input.get("message_history", [])

            if session_id and user_message:
                if len(message_history) == 0:
                    # Get message history from the database
                    message_history = self._get_message_history(session_id)

                # Add message_history to input
                input["message_history"] = message_history

        # Run the workflow
        outputs = await self._execute_workflow(input, node_ids, precomputed_outputs)

        # For chatbot workflows, store the new messages
        if self.workflow.spur_type == SpurType.CHATBOT:
            session_id = input.get("session_id")
            user_message = input.get("user_message")

            # Find the output node to get assistant's message
            output_node = next(
                (node for node in self.workflow.nodes if node.node_type == "OutputNode"), None
            )

            if output_node and session_id and user_message:
                # Get assistant's message from outputs
                assistant_message = None
                if output_node.id in outputs:
                    output = outputs[output_node.id]
                    # Get the output as a dict to safely access fields
                    output_dict = output.model_dump()
                    assistant_message = str(output_dict.get("assistant_message", ""))

                if assistant_message:
                    # Store the messages
                    self._store_message_history(session_id, user_message, assistant_message)

        return outputs

    async def __call__(
        self,
        input: Dict[str, Any] = {},
        node_ids: List[str] = [],
        precomputed_outputs: Dict[str, Dict[str, Any] | List[Dict[str, Any]]] = {},
    ) -> Dict[str, BaseNodeOutput]:
        """Execute the workflow with the given input data.

        input: input for the input node of the workflow. Dict[<field_name>: <value>]
        node_ids: list of node_ids to run. If empty, run all nodes.
        precomputed_outputs: precomputed outputs for the nodes.
        These nodes will not be executed again.
        """
        return await self.run(input, node_ids, precomputed_outputs)

    async def run_batch(
        self, input_iterator: Iterator[Dict[str, Any]], batch_size: int = 100
    ) -> List[Dict[str, BaseNodeOutput]]:
        """Run the workflow on a batch of inputs."""
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

    def add_resumed_node_id(self, node_id: str) -> None:
        """Add a node ID to the set of resumed node IDs."""
        self._resumed_node_ids.add(node_id)


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

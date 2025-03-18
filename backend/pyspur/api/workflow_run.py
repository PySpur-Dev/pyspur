import asyncio
import base64
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path  # Import Path for directory handling
from typing import Any, Awaitable, Callable, Coroutine, Dict, List, Optional, Set, Tuple, Union

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy.orm import Session

from ..database import get_db
from ..dataset.ds_util import get_ds_column_names, get_ds_iterator
from ..execution.task_recorder import TaskRecorder
from ..execution.workflow_execution_context import WorkflowExecutionContext
from ..execution.workflow_executor import WorkflowExecutor
from ..models.dataset_model import DatasetModel
from ..models.output_file_model import OutputFileModel
from ..models.run_model import RunModel, RunStatus
from ..models.task_model import TaskModel, TaskStatus
from ..models.workflow_model import WorkflowModel
from ..nodes.factory import NodeFactory
from ..nodes.logic.human_intervention import HumanInterventionNodeOutput, PauseException
from ..schemas.pause_schemas import (
    PausedWorkflowResponseSchema,
    PauseHistoryResponseSchema,
)
from ..schemas.run_schemas import (
    BatchRunRequestSchema,
    PartialRunRequestSchema,
    ResumeRunRequestSchema,
    RunResponseSchema,
    StartRunRequestSchema,
)
from ..schemas.workflow_schemas import WorkflowDefinitionSchema, WorkflowNodeSchema
from ..utils.workflow_version_utils import fetch_workflow_version

router = APIRouter()


async def create_run_model(
    workflow_id: str,
    workflow_version_id: str,
    initial_inputs: Dict[str, Dict[str, Any]],
    parent_run_id: Optional[str],
    run_type: str,
    db: Session,
) -> RunModel:
    new_run = RunModel(
        workflow_id=workflow_id,
        workflow_version_id=workflow_version_id,
        status=RunStatus.PENDING,
        initial_inputs=initial_inputs,
        start_time=datetime.now(timezone.utc),
        parent_run_id=parent_run_id,
        run_type=run_type,
    )
    db.add(new_run)
    db.commit()
    db.refresh(new_run)
    return new_run


def process_embedded_files(
    workflow_id: str,
    initial_inputs: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """Process any embedded files in the initial inputs and save them to disk.

    Returns updated inputs with file paths instead of data URIs.
    """
    processed_inputs = initial_inputs.copy()

    # Iterate through the values to find data URIs recursively
    def find_and_replace_data_uris(data: Any) -> Any:
        if isinstance(data, dict):
            return {str(k): find_and_replace_data_uris(v) for k, v in data.items()}  # type: ignore
        elif isinstance(data, list):
            return [find_and_replace_data_uris(item) for item in data]  # type: ignore
        elif isinstance(data, str) and data.startswith("data:"):
            return save_embedded_file(data, workflow_id)
        else:
            return data

    processed_inputs = find_and_replace_data_uris(processed_inputs)
    return processed_inputs


@router.post(
    "/{workflow_id}/runv2/",
    response_model=RunResponseSchema,
    description="Run a workflow and return the run details with outputs",
)
async def run_workflow_blocking_v2(  # noqa: C901
    workflow_id: str,
    request: StartRunRequestSchema,
    db: Session = Depends(get_db),
    run_type: str = "interactive",
) -> RunResponseSchema:
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow_version = fetch_workflow_version(workflow_id, workflow, db)
    workflow_definition = WorkflowDefinitionSchema.model_validate(workflow_version.definition)

    initial_inputs = request.initial_inputs or {}

    # Process any embedded files in the inputs
    initial_inputs = process_embedded_files(workflow_id, initial_inputs)

    # Handle file paths if present
    if request.files:
        for node_id, file_paths in request.files.items():
            if node_id in initial_inputs:
                initial_inputs[node_id]["files"] = file_paths

    new_run = await create_run_model(
        workflow_id,
        workflow_version.id,
        initial_inputs,
        request.parent_run_id,
        run_type,
        db,
    )
    task_recorder = TaskRecorder(db, new_run.id)
    context = WorkflowExecutionContext(
        workflow_id=workflow.id,
        run_id=new_run.id,
        parent_run_id=request.parent_run_id,
        run_type=run_type,
        db_session=db,
        workflow_definition=workflow_version.definition,
    )
    executor = WorkflowExecutor(
        workflow=workflow_definition,
        task_recorder=task_recorder,
        context=context,
    )
    input_node = next(node for node in workflow_definition.nodes if node.node_type == "InputNode")

    try:
        outputs = await executor(initial_inputs[input_node.id])

        # Check if any tasks were paused
        has_paused_tasks = False
        paused_node_ids: List[str] = []
        for task in new_run.tasks:
            if task.status == TaskStatus.PAUSED:
                has_paused_tasks = True
                paused_node_ids.append(task.node_id)

        if has_paused_tasks:
            # If we have paused tasks, ensure the run is in a PAUSED state
            new_run.status = RunStatus.PAUSED

            # Get all blocked nodes from paused nodes
            all_blocked_nodes: Set[str] = set()
            for paused_node_id in paused_node_ids:
                blocked_nodes = executor.get_blocked_nodes(paused_node_id)
                all_blocked_nodes.update(blocked_nodes)

            # Make sure all downstream nodes are in PENDING status
            for task in new_run.tasks:
                if task.status == TaskStatus.CANCELED and task.node_id in all_blocked_nodes:
                    # Update any CANCELED tasks that should be PENDING
                    task_recorder.update_task(
                        node_id=task.node_id,
                        status=TaskStatus.PENDING,
                        end_time=datetime.now(),
                        is_downstream_of_pause=True,
                    )
        else:
            new_run.status = RunStatus.COMPLETED

        new_run.end_time = datetime.now(timezone.utc)
        nodes = workflow_version.definition["nodes"]
        nodes = [WorkflowNodeSchema.model_validate(node) for node in nodes]
        # Create outputs dictionary using node titles as keys instead of node IDs
        title_output_dict = {}
        for node_id, node_output in outputs.items():
            # Find the node with this ID to get its title
            node = next((n for n in nodes if n.id == node_id), None)
            if node and hasattr(node, "title") and node.title:
                # Use the node's title as the key
                title_output_dict[node.title] = node_output.model_dump()
        new_run.outputs = title_output_dict
        db.commit()

        # Refresh the run to get the updated tasks
        db.refresh(new_run)
        response = RunResponseSchema.model_validate(new_run)
        response.message = "Workflow execution completed successfully."
        return response

    except PauseException as e:
        # Make sure the run status is set to PAUSED
        new_run.status = RunStatus.PAUSED
        new_run.outputs = {k: v.model_dump() for k, v in executor.outputs.items() if v is not None}

        # Get all blocked nodes from paused nodes
        paused_node_ids = [
            task.node_id for task in new_run.tasks if task.status == TaskStatus.PAUSED
        ]
        all_blocked_nodes: Set[str] = set()
        for paused_node_id in paused_node_ids:
            blocked_nodes = executor.get_blocked_nodes(paused_node_id)
            all_blocked_nodes.update(blocked_nodes)

        # Make sure all downstream nodes are in PENDING status
        for task in new_run.tasks:
            if task.status == TaskStatus.CANCELED and task.node_id in all_blocked_nodes:
                # Update any CANCELED tasks that should be PENDING
                task_recorder.update_task(
                    node_id=task.node_id,
                    status=TaskStatus.PENDING,
                    end_time=datetime.now(),
                    is_downstream_of_pause=True,
                )

        db.commit()
        # Refresh the run to get the updated tasks
        db.refresh(new_run)
        response = RunResponseSchema.model_validate(new_run)
        response.message = "Workflow execution paused for human intervention."
        raise HTTPException(
            status_code=202,
            detail=response.model_dump(),
        ) from e
    except Exception as e:
        new_run.status = RunStatus.FAILED
        new_run.end_time = datetime.now(timezone.utc)
        db.commit()
        response = RunResponseSchema.model_validate(new_run)
        response.message = f"Workflow execution failed: {str(e)}"
        raise HTTPException(
            status_code=500,
            detail=response.model_dump(),
        ) from e


@router.post(
    "/{workflow_id}/run/",
    response_model=Dict[str, Any],
    description="Run a workflow and return the outputs",
)
async def run_workflow_blocking(  # noqa: C901
    workflow_id: str,
    request: StartRunRequestSchema,
    db: Session = Depends(get_db),
    run_type: str = "interactive",
) -> Dict[str, Any]:
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow_version = fetch_workflow_version(workflow_id, workflow, db)
    workflow_definition = WorkflowDefinitionSchema.model_validate(workflow_version.definition)

    initial_inputs = request.initial_inputs or {}

    # Process any embedded files in the inputs
    initial_inputs = process_embedded_files(workflow_id, initial_inputs)

    # Handle file paths if present
    if request.files:
        for node_id, file_paths in request.files.items():
            if node_id in initial_inputs:
                initial_inputs[node_id]["files"] = file_paths

    new_run = await create_run_model(
        workflow_id,
        workflow_version.id,
        initial_inputs,
        request.parent_run_id,
        run_type,
        db,
    )
    task_recorder = TaskRecorder(db, new_run.id)
    context = WorkflowExecutionContext(
        workflow_id=workflow.id,
        run_id=new_run.id,
        parent_run_id=request.parent_run_id,
        run_type=run_type,
        db_session=db,
        workflow_definition=workflow_version.definition,
    )
    executor = WorkflowExecutor(
        workflow=workflow_definition,
        task_recorder=task_recorder,
        context=context,
    )
    input_node = next(node for node in workflow_definition.nodes if node.node_type == "InputNode")

    try:
        outputs = await executor(initial_inputs[input_node.id])

        # Check if any tasks were paused
        has_paused_tasks = False
        paused_node_ids: List[str] = []
        for task in new_run.tasks:
            if task.status == TaskStatus.PAUSED:
                has_paused_tasks = True
                paused_node_ids.append(task.node_id)

        if has_paused_tasks:
            # If we have paused tasks, ensure the run is in a PAUSED state
            new_run.status = RunStatus.PAUSED

            # Get all blocked nodes from paused nodes
            all_blocked_nodes: Set[str] = set()
            for paused_node_id in paused_node_ids:
                blocked_nodes = executor.get_blocked_nodes(paused_node_id)
                all_blocked_nodes.update(blocked_nodes)

            # Make sure all downstream nodes are in PENDING status
            for task in new_run.tasks:
                if task.status == TaskStatus.CANCELED and task.node_id in all_blocked_nodes:
                    # Update any CANCELED tasks that should be PENDING
                    task_recorder.update_task(
                        node_id=task.node_id,
                        status=TaskStatus.PENDING,
                        end_time=datetime.now(),
                        is_downstream_of_pause=True,
                    )
        else:
            new_run.status = RunStatus.COMPLETED

        new_run.end_time = datetime.now(timezone.utc)
        new_run.outputs = {k: v.model_dump() for k, v in outputs.items()}
        db.commit()

        # Refresh the run to get the updated tasks
        db.refresh(new_run)
        return outputs
    except PauseException as e:
        # Make sure the run status is set to PAUSED
        new_run.status = RunStatus.PAUSED
        new_run.outputs = {k: v.model_dump() for k, v in executor.outputs.items() if v is not None}

        # Get all blocked nodes from paused nodes
        paused_node_ids = [
            task.node_id for task in new_run.tasks if task.status == TaskStatus.PAUSED
        ]
        all_blocked_nodes: Set[str] = set()
        for paused_node_id in paused_node_ids:
            blocked_nodes = executor.get_blocked_nodes(paused_node_id)
            all_blocked_nodes.update(blocked_nodes)

        # Make sure all downstream nodes are in PENDING status
        for task in new_run.tasks:
            if task.status == TaskStatus.CANCELED and task.node_id in all_blocked_nodes:
                # Update any CANCELED tasks that should be PENDING
                task_recorder.update_task(
                    node_id=task.node_id,
                    status=TaskStatus.PENDING,
                    end_time=datetime.now(),
                    is_downstream_of_pause=True,
                )

        db.commit()
        # Refresh the run to get the updated tasks
        db.refresh(new_run)
        raise e


@router.post(
    "/{workflow_id}/start_run/",
    response_model=RunResponseSchema,
    description="Start a non-blocking workflow run and return the run details",
)
async def run_workflow_non_blocking(  # noqa: C901
    workflow_id: str,
    start_run_request: StartRunRequestSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    run_type: str = "interactive",
) -> RunResponseSchema:
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow_version = fetch_workflow_version(workflow_id, workflow, db)
    workflow_definition = WorkflowDefinitionSchema.model_validate(workflow_version.definition)

    initial_inputs = start_run_request.initial_inputs or {}

    # Process any embedded files in the inputs
    initial_inputs = process_embedded_files(workflow_id, initial_inputs)

    new_run = await create_run_model(
        workflow_id,
        workflow_version.id,
        initial_inputs,
        start_run_request.parent_run_id,
        run_type,
        db,
    )

    async def run_workflow_task(run_id: str, workflow_definition: WorkflowDefinitionSchema):
        with next(get_db()) as session:
            run = session.query(RunModel).filter(RunModel.id == run_id).first()
            if not run:
                session.close()
                return

            # Initialize workflow execution
            run.status = RunStatus.RUNNING
            session.commit()
            task_recorder, context, executor = _setup_workflow_execution(
                session,
                run,
                run_id,
                start_run_request.parent_run_id,
                run_type,
                workflow_version,
                workflow_definition,
            )

            # Store context for debugging or audit purposes
            run.execution_context = context.model_dump() if hasattr(context, "model_dump") else None

            try:
                # Execute workflow
                assert run.initial_inputs
                input_node = next(
                    node for node in workflow_definition.nodes if node.node_type == "InputNode"
                )
                outputs = await executor(run.initial_inputs[input_node.id])
                run.outputs = {k: v.model_dump() for k, v in outputs.items()}

                # Handle paused tasks if any
                has_paused_tasks = _check_for_paused_tasks(run)

                if has_paused_tasks:
                    _handle_paused_workflow(run, executor, task_recorder, workflow_version)
                else:
                    run.status = RunStatus.COMPLETED

                run.end_time = datetime.now(timezone.utc)
            except PauseException:
                _handle_pause_exception(run, executor, task_recorder, workflow_version)
                session.commit()
                # Refresh the run to get the updated tasks
                session.refresh(run)
                return  # Don't raise the exception so the background task can complete
            except Exception as e:
                run.status = RunStatus.FAILED
                run.end_time = datetime.now(timezone.utc)
                session.commit()
                raise e
            session.commit()

    def _setup_workflow_execution(
        session: Session,
        run: RunModel,
        run_id: str,
        parent_run_id: Optional[str],
        run_type: str,
        workflow_version: Any,
        workflow_definition: WorkflowDefinitionSchema,
    ) -> Tuple[TaskRecorder, WorkflowExecutionContext, WorkflowExecutor]:
        """Set up the execution environment for a workflow."""
        task_recorder = TaskRecorder(session, run_id)
        context = WorkflowExecutionContext(
            workflow_id=run.workflow_id,
            run_id=run_id,
            parent_run_id=parent_run_id,
            run_type=run_type,
            db_session=session,
            workflow_definition=workflow_version.definition,
        )
        executor = WorkflowExecutor(
            workflow=workflow_definition,
            task_recorder=task_recorder,
            context=context,
        )
        return task_recorder, context, executor

    def _check_for_paused_tasks(run: RunModel) -> bool:
        """Check if any tasks in the run are paused."""
        for task in run.tasks:
            if task.status == TaskStatus.PAUSED:
                return True
        return False

    def _handle_paused_workflow(
        run: RunModel,
        executor: WorkflowExecutor,
        task_recorder: TaskRecorder,
        workflow_version: Any,
    ) -> None:
        """Handle case when workflow has paused tasks."""
        run.status = RunStatus.PAUSED

        # Get all paused node IDs
        paused_node_ids = [task.node_id for task in run.tasks if task.status == TaskStatus.PAUSED]

        # Update downstream tasks of paused nodes
        _update_downstream_tasks(paused_node_ids, executor, workflow_version, run, task_recorder)

    def _handle_pause_exception(
        run: RunModel,
        executor: WorkflowExecutor,
        task_recorder: TaskRecorder,
        workflow_version: Any,
    ) -> None:
        """Handle PauseException during workflow execution."""
        run.status = RunStatus.PAUSED
        run.outputs = {k: v.model_dump() for k, v in executor.outputs.items() if v is not None}

        # Get all paused node IDs
        paused_node_ids = [task.node_id for task in run.tasks if task.status == TaskStatus.PAUSED]

        # Update downstream tasks of paused nodes
        _update_downstream_tasks(paused_node_ids, executor, workflow_version, run, task_recorder)

    def _update_downstream_tasks(
        paused_node_ids: List[str],
        executor: WorkflowExecutor,
        workflow_version: Any,
        run: RunModel,
        task_recorder: TaskRecorder,
    ) -> None:
        """Update status of tasks that depend on paused nodes."""
        all_blocked_nodes: Set[str] = set()
        for paused_node_id in paused_node_ids:
            blocked_nodes = executor.get_blocked_nodes(paused_node_id)
            all_blocked_nodes.update(blocked_nodes)

        # Make sure all downstream nodes are in PENDING status
        for task in run.tasks:
            if task.status == TaskStatus.CANCELED and task.node_id in all_blocked_nodes:
                # Update any CANCELED tasks that should be PENDING
                task_recorder.update_task(
                    node_id=task.node_id,
                    status=TaskStatus.PENDING,
                    end_time=datetime.now(),
                    is_downstream_of_pause=True,
                )

    background_tasks.add_task(run_workflow_task, new_run.id, workflow_definition)

    return new_run


@router.post(
    "/{workflow_id}/run_partial/",
    response_model=Dict[str, Any],
    description="Run a partial workflow and return the outputs",
)
async def run_partial_workflow(
    workflow_id: str,
    request: PartialRunRequestSchema,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow_definition = WorkflowDefinitionSchema.model_validate(workflow.definition)
    executor = WorkflowExecutor(workflow_definition)
    input_node = next(node for node in workflow_definition.nodes if node.node_type == "InputNode")
    initial_inputs = request.initial_inputs or {}
    try:
        outputs = await executor.run(
            input=initial_inputs.get(input_node.id, {}),
            node_ids=[request.node_id],
            precomputed_outputs=request.partial_outputs or {},
        )
        return outputs
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post(
    "/{workflow_id}/start_batch_run/",
    response_model=RunResponseSchema,
    description="Start a batch run of a workflow over a dataset and return the run details",
)
async def batch_run_workflow_non_blocking(  # noqa: C901
    workflow_id: str,
    request: BatchRunRequestSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> RunResponseSchema:
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow_version = fetch_workflow_version(workflow_id, workflow, db)

    dataset_id = request.dataset_id
    new_run = await create_run_model(workflow_id, workflow_version.id, {}, None, "batch", db)

    # parse the dataset
    dataset = db.query(DatasetModel).filter(DatasetModel.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # ensure ds columns match workflow inputs
    dataset_columns = get_ds_column_names(dataset.file_path)
    workflow_definition = WorkflowDefinitionSchema.model_validate(workflow_version.definition)
    input_node = next(node for node in workflow_definition.nodes if node.node_type == "InputNode")
    input_node_id = input_node.id
    workflow_input_schema: Dict[str, str] = input_node.config["input_schema"]
    for col in workflow_input_schema.keys():
        if col not in dataset_columns:
            raise HTTPException(
                status_code=400,
                detail=f"Input field '{col}' in input schema not found in the dataset",
            )

    # create output file
    output_file_name = f"output_{new_run.id}.jsonl"
    output_file_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "output_files", output_file_name
    )
    output_file = OutputFileModel(
        file_name=output_file_name,
        file_path=output_file_path,
    )
    db.add(output_file)
    db.commit()

    file_path = dataset.file_path

    mini_batch_size = request.mini_batch_size

    async def start_mini_batch_runs(
        file_path: str,
        workflow_id: str,
        workflow_input_schema: Dict[str, str],
        input_node_id: str,
        parent_run_id: str,
        background_tasks: BackgroundTasks,
        db: Session,
        mini_batch_size: int,
        output_file_path: str,
    ):
        ds_iter = get_ds_iterator(file_path)
        current_batch: List[Awaitable[Dict[str, Any]]] = []
        batch_count = 0
        for inputs in ds_iter:
            initial_inputs = {
                input_node_id: {k: v for k, v in inputs.items() if k in workflow_input_schema}
            }
            single_input_run_task = run_workflow_blocking(
                workflow_id=workflow_id,
                request=StartRunRequestSchema(
                    initial_inputs=initial_inputs, parent_run_id=parent_run_id
                ),
                db=db,
                run_type="batch",
            )
            current_batch.append(single_input_run_task)
            if len(current_batch) == mini_batch_size:
                minibatch_results = await asyncio.gather(*current_batch)
                current_batch = []
                batch_count += 1
                with open(output_file_path, "a") as output_file:
                    for output in minibatch_results:
                        output = {
                            node_id: output.model_dump() for node_id, output in output.items()
                        }
                        output_file.write(json.dumps(output) + "\n")

        if current_batch:
            results = await asyncio.gather(*current_batch)
            with open(output_file_path, "a") as output_file:
                for output in results:
                    output = {node_id: output.model_dump() for node_id, output in output.items()}
                    output_file.write(json.dumps(output) + "\n")

        with next(get_db()) as session:
            run = session.query(RunModel).filter(RunModel.id == parent_run_id).first()
            if not run:
                session.close()
                return
            run.status = RunStatus.COMPLETED
            run.end_time = datetime.now(timezone.utc)
            session.commit()

    background_tasks.add_task(
        start_mini_batch_runs,
        file_path,
        workflow_id,
        workflow_input_schema,
        input_node_id,
        new_run.id,
        background_tasks,
        db,
        mini_batch_size,
        output_file_path,
    )
    new_run.output_file_id = output_file.id
    db.commit()
    return new_run


@router.get(
    "/{workflow_id}/runs/",
    response_model=List[RunResponseSchema],
    description="List all runs of a workflow",
)
def list_runs(
    workflow_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    start_date: Optional[datetime] = Query(
        default=None, description="Filter runs after this date (inclusive)"
    ),
    end_date: Optional[datetime] = Query(
        default=None, description="Filter runs before this date (inclusive)"
    ),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size
    query = db.query(RunModel).filter(RunModel.workflow_id == workflow_id)

    # Apply date filters if provided
    if start_date:
        query = query.filter(RunModel.start_time >= start_date)
    if end_date:
        query = query.filter(RunModel.start_time <= end_date)

    # Order by start time descending and apply pagination
    runs = query.order_by(RunModel.start_time.desc()).offset(offset).limit(page_size).all()

    # Update run status based on task status
    for run in runs:
        if run.status != RunStatus.FAILED:
            failed_tasks = [task for task in run.tasks if task.status == TaskStatus.FAILED]
            running_and_pending_tasks = [
                task
                for task in run.tasks
                if task.status in [TaskStatus.PENDING, TaskStatus.RUNNING]
            ]
            if failed_tasks and len(running_and_pending_tasks) == 0:
                run.status = RunStatus.FAILED
                db.commit()
                db.refresh(run)

    return runs


def save_embedded_file(data_uri: str, workflow_id: str) -> str:
    """Save a file from a data URI and return its relative path.

    Uses file content hash for the filename to avoid duplicates.
    """
    # Extract the base64 data from the data URI
    match = re.match(r"data:([^;]+);base64,(.+)", data_uri)
    if not match:
        raise ValueError("Invalid data URI format")

    mime_type, base64_data = match.groups()
    file_data = base64.b64decode(base64_data)

    # Generate hash from file content
    file_hash = hashlib.sha256(file_data).hexdigest()[:16]  # Use first 16 chars of hash

    # Determine file extension from mime type
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "application/pdf": ".pdf",
        "video/mp4": ".mp4",
        "text/plain": ".txt",
        "text/csv": ".csv",
    }
    extension = ext_map.get(mime_type, "")

    # Create filename and ensure directory exists
    filename = f"{file_hash}{extension}"
    upload_dir = Path("data/run_files") / workflow_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Save the file
    file_path = upload_dir / filename
    with open(file_path, "wb") as f:
        f.write(file_data)

    return f"run_files/{workflow_id}/{filename}"


def get_paused_workflows(
    db: Session,
    page: int = 1,
    page_size: int = 10,
) -> List[PausedWorkflowResponseSchema]:
    """Get all currently paused workflows."""
    # First get runs with paused tasks
    paused_task_runs = (
        db.query(TaskModel.run_id).filter(TaskModel.status == TaskStatus.PAUSED).distinct()
    )

    # Then get runs with running tasks
    running_task_runs = (
        db.query(TaskModel.run_id).filter(TaskModel.status == TaskStatus.RUNNING).distinct()
    )

    # Main query to get paused runs
    paused_runs = (
        db.query(RunModel)
        .filter(
            # Either the run is marked as paused
            (RunModel.status == RunStatus.PAUSED)
            |
            # Or has paused tasks but no running tasks
            (
                RunModel.id.in_(paused_task_runs.scalar_subquery())
                & ~RunModel.id.in_(running_task_runs.scalar_subquery())
            )
        )
        .order_by(RunModel.start_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Build response with workflow definitions
    result: List[PausedWorkflowResponseSchema] = []
    for run in paused_runs:
        workflow = db.query(WorkflowModel).filter(WorkflowModel.id == run.workflow_id).first()
        if not workflow:
            continue

        workflow_definition = WorkflowDefinitionSchema.model_validate(workflow.definition)

        # Find the current pause information from tasks
        current_pause = None
        if run.tasks:
            # Find the most recently paused task
            paused_tasks = [task for task in run.tasks if task.status == TaskStatus.PAUSED]
            if paused_tasks:
                # Sort by end_time descending to get the most recent pause
                paused_tasks.sort(
                    key=lambda x: (x.end_time or x.start_time or datetime.min).replace(
                        tzinfo=timezone.utc
                    ),
                    reverse=True,
                )
                latest_paused_task = paused_tasks[0]

                # Only create pause history if we have a pause time
                pause_time = latest_paused_task.end_time or latest_paused_task.start_time
                if pause_time:
                    # Ensure timezone is set
                    if pause_time.tzinfo is None:
                        pause_time = pause_time.replace(tzinfo=timezone.utc)

                    current_pause = PauseHistoryResponseSchema(
                        id=f"PH_{run.id}_{latest_paused_task.node_id}",
                        run_id=run.id,
                        node_id=latest_paused_task.node_id,
                        pause_message=latest_paused_task.error or "Human intervention required",
                        pause_time=pause_time,
                        resume_time=latest_paused_task.end_time.replace(tzinfo=timezone.utc)
                        if latest_paused_task.end_time
                        else None,
                        resume_user_id=None,  # This would come from task metadata if needed
                        resume_action=None,  # This would come from task metadata if needed
                        input_data=latest_paused_task.inputs or {},
                        comments=None,  # This would come from task metadata if needed
                    )

        if current_pause:
            result.append(
                PausedWorkflowResponseSchema(
                    run=RunResponseSchema.model_validate(run),
                    current_pause=current_pause,
                    workflow=workflow_definition,
                )
            )

    return result


def get_run_pause_history(db: Session, run_id: str) -> List[PauseHistoryResponseSchema]:
    """Get the pause history for a specific run."""
    run = db.query(RunModel).filter(RunModel.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Build pause history from tasks
    history: List[PauseHistoryResponseSchema] = []

    if run.tasks:
        # Get all tasks that were ever paused
        paused_tasks = [task for task in run.tasks if task.status == TaskStatus.PAUSED]
        for task in paused_tasks:
            # Skip if no pause time
            pause_time = task.end_time or task.start_time
            if not pause_time:
                continue

            # Ensure timezone is set
            if pause_time.tzinfo is None:
                pause_time = pause_time.replace(tzinfo=timezone.utc)

            history.append(
                PauseHistoryResponseSchema(
                    id=f"PH_{run.id}_{task.node_id}",
                    run_id=run.id,
                    node_id=task.node_id,
                    pause_message=task.error or "Human intervention required",
                    pause_time=pause_time,
                    resume_time=task.end_time.replace(tzinfo=timezone.utc)
                    if task.end_time
                    else None,
                    resume_user_id=None,  # This would come from task metadata if needed
                    resume_action=None,  # This would come from task metadata if needed
                    input_data=task.inputs or {},
                    comments=None,  # This would come from task metadata if needed
                )
            )

    return sorted(history, key=lambda x: x.pause_time, reverse=True)


def _get_and_validate_paused_run(
    db: Session,
    run_id: str,
) -> Tuple[RunModel, TaskModel]:
    """Get the paused run and validate its state.

    Args:
        db: Database session
        run_id: The ID of the paused run

    Returns:
        Tuple of (run, paused_task)

    Raises:
        HTTPException: If the run is not found or not in a paused state

    """
    # Get the run
    run = db.query(RunModel).filter(RunModel.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status != RunStatus.PAUSED:
        # Check if there are any paused tasks
        has_paused_tasks = any(task.status == TaskStatus.PAUSED for task in run.tasks)
        if not has_paused_tasks:
            raise HTTPException(status_code=400, detail="Run is not in a paused state")

    # Find the paused task
    paused_task = None
    for task in run.tasks:
        if task.status == TaskStatus.PAUSED:
            paused_task = task
            break

    if not paused_task:
        raise HTTPException(status_code=400, detail="No paused task found for this run")

    return run, paused_task


def _update_paused_task(
    db: Session,
    run: RunModel,
    paused_task: TaskModel,
    action_request: ResumeRunRequestSchema,
) -> None:
    """Update the paused task with the action.

    Args:
        db: Database session
        run: The run model
        paused_task: The paused task to update
        action_request: The action request

    """
    # Update the task with the action
    paused_task.end_time = datetime.now(timezone.utc)
    paused_task.status = TaskStatus.COMPLETED  # Mark as COMPLETED instead of RUNNING
    paused_task.error = None  # Clear any error message
    paused_task.outputs = action_request.inputs  # Store new inputs as outputs

    # Delete any pending tasks for the same node
    # This prevents duplicate tasks when the workflow is resumed
    pending_tasks = (
        db.query(TaskModel)
        .filter(
            TaskModel.run_id == run.id,
            TaskModel.node_id == paused_task.node_id,
            TaskModel.status == TaskStatus.PENDING,
        )
        .all()
    )

    for pending_task in pending_tasks:
        db.delete(pending_task)

    db.commit()
    db.refresh(run)


def _setup_workflow_executor(
    db: Session,
    run: RunModel,
    paused_task: TaskModel,
) -> Tuple[WorkflowExecutor, WorkflowDefinitionSchema, WorkflowExecutionContext]:
    """Set up the workflow executor for resuming the workflow.

    Args:
        db: Database session
        run: The run model
        paused_task: The paused task

    Returns:
        Tuple of (executor, workflow_definition, context)

    Raises:
        HTTPException: If the workflow is not found

    """
    # Get the workflow
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == run.workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow_version = fetch_workflow_version(run.workflow_id, workflow, db)
    workflow_definition = WorkflowDefinitionSchema.model_validate(workflow_version.definition)

    # Update run status to RUNNING
    run.status = RunStatus.RUNNING
    db.commit()

    # Create a new task recorder and context
    task_recorder = TaskRecorder(db, run.id)
    context = WorkflowExecutionContext(
        workflow_id=workflow.id,
        run_id=run.id,
        parent_run_id=run.parent_run_id,
        run_type=run.run_type,
        db_session=db,
        workflow_definition=workflow_version.definition,
    )

    # Create executor with the existing workflow definition - pass the paused node ID as resumed
    executor = WorkflowExecutor(
        workflow=workflow_definition,
        task_recorder=task_recorder,
        context=context,
        resumed_node_ids=[paused_task.node_id],  # Tell executor which node was resumed
    )

    return executor, workflow_definition, context


def _update_executor_outputs(
    executor: WorkflowExecutor,
    run: RunModel,
    paused_task: TaskModel,
    action_request: ResumeRunRequestSchema,
    workflow_definition: WorkflowDefinitionSchema,
) -> None:
    """Update the executor outputs with existing outputs and resume information.

    Args:
        executor: The workflow executor
        run: The run model
        paused_task: The paused task
        action_request: The action request
        workflow_definition: The workflow definition

    """
    # Update the outputs with existing outputs
    if run.outputs:
        executor.outputs = {
            k: NodeFactory.create_node(
                node_name=node.title,
                node_type_name=node.node_type,
                config=node.config,
            ).output_model.model_validate(v)
            for k, v in run.outputs.items()
            for node in workflow_definition.nodes
            if node.id == k
        }

    # Update the paused node's output with resume information
    if paused_task.node_id and paused_task.node_id in executor.outputs:
        node_output = executor.outputs[paused_task.node_id]
        if isinstance(node_output, HumanInterventionNodeOutput):
            # Create a properly structured output for the HumanInterventionNode
            # First, gather the action request inputs
            inputs_data = {}

            # If we have task inputs, include them in the structure
            if paused_task.inputs and isinstance(paused_task.inputs, dict):
                inputs_data.update(paused_task.inputs)  # type: ignore

            # Add the new inputs from the action request
            # This ensures downstream nodes can access values via HumanInterventionNode_1.input_1
            if action_request.inputs:
                inputs_data.update(action_request.inputs)  # type: ignore

            # Create the output with the proper structure - don't nest under input_node
            # This makes fields directly accessible
            # in templates like {{HumanInterventionNode_1.input_1}}
            updated_output = HumanInterventionNodeOutput(**inputs_data)

            # For debugging
            print(f"Updated HumanInterventionNodeOutput structure: {updated_output}")

            executor.outputs[paused_task.node_id] = updated_output


def process_pause_action(
    db: Session,
    run_id: str,
    action_request: ResumeRunRequestSchema,
    bg_tasks: Optional[BackgroundTasks] = None,
) -> RunResponseSchema:
    """Process an action on a paused workflow.

    This is the common function used by the take_pause_action endpoint.
    It handles the core logic for processing human intervention in paused workflows.

    The workflow_id is retrieved from the run object,
    so it doesn't need to be passed as a parameter.

    Args:
        db: Database session
        run_id: The ID of the paused run
        action_request: The details of the action to take
        bg_tasks: Optional background tasks handler to resume the workflow asynchronously

    Returns:
        Information about the resumed run

    Raises:
        HTTPException: If the run is not found or not in a paused state

    """
    # Get and validate the run and paused task
    run, paused_task = _get_and_validate_paused_run(db, run_id)

    # Update the paused task
    _update_paused_task(db, run, paused_task, action_request)

    # If background_tasks is provided, automatically resume the workflow
    if bg_tasks:
        # Setup the workflow executor
        executor, workflow_definition, context = _setup_workflow_executor(db, run, paused_task)

        # Update executor outputs
        _update_executor_outputs(executor, run, paused_task, action_request, workflow_definition)

        # Define the async workflow task and add it to background tasks
        bg_tasks.add_task(
            _create_resume_workflow_task(executor, run, paused_task, context, action_request, db)
        )

        response = RunResponseSchema.model_validate(run)
        response.message = "Task completed and workflow execution resumed automatically."
    else:
        # If no background_tasks, just return as before
        response = RunResponseSchema.model_validate(run)
        response.message = (
            "Task marked as completed. Please call the resume"
            "endpoint to continue workflow execution."
        )

    return response


def _create_resume_workflow_task(  # noqa: C901
    executor: WorkflowExecutor,
    run: RunModel,
    paused_task: TaskModel,
    context: WorkflowExecutionContext,
    action_request: ResumeRunRequestSchema,
    db: Session,
) -> Callable[[], Coroutine[Any, Any, None]]:
    """Create the async function for resuming the workflow.

    Args:
        executor: The workflow executor
        run: The run model
        paused_task: The paused task
        context: The workflow execution context
        action_request: The action request
        db: Database session

    Returns:
        Async function to resume the workflow

    """

    async def resume_workflow_task():  # noqa: C901
        try:
            # Find any PENDING tasks that were blocked by the paused node
            blocked_node_ids: set[str] = set()
            if _workflow_definition := getattr(context, "workflow_definition", None):
                blocked_node_ids = executor.get_blocked_nodes(paused_task.node_id)

            # Update their status to RUNNING
            for task in run.tasks:
                if task.status == TaskStatus.PENDING and task.node_id in blocked_node_ids:
                    task.status = TaskStatus.RUNNING
                    task.start_time = datetime.now(timezone.utc)
            db.commit()

            # Convert outputs to dict format for precomputed_outputs
            precomputed: Dict[str, Union[Dict[str, Any], List[Dict[str, Any]]]] = {}
            for k, v in executor.outputs.items():
                if v is not None:
                    try:
                        precomputed[k] = v.model_dump()
                    except Exception:
                        continue

            # Get all nodes including blocked nodes and the resumed node
            # We specifically don't include the paused node
            # in nodes_to_run since it's already been completed
            nodes_to_run: set[str] = blocked_node_ids

            # IMPORTANT: Add the paused node ID to the executor's resumed_node_ids set
            # This prevents the executor from creating a new task for this node
            executor.add_resumed_node_id(paused_task.node_id)

            # Also add any node IDs that already have COMPLETED tasks
            # This prevents the executor from creating new tasks for these nodes
            completed_node_ids: set[str] = set()
            for task in run.tasks:
                if task.status == TaskStatus.COMPLETED:
                    completed_node_ids.add(task.node_id)
                    executor.add_resumed_node_id(task.node_id)

            # Make sure we include any necessary node inputs in the precomputed outputs
            if action_request.inputs and paused_task.node_id:
                # Set the action_request.inputs as the output for the paused task
                # When we updated the paused node's output above, we already
                # created the proper HumanInterventionNodeOutput structure
                # So we just need to make sure it's formatted properly for precomputed_outputs
                node_output = executor.outputs.get(paused_task.node_id)
                if node_output:
                    # Use model_dump to get the flat structure of fields
                    precomputed[paused_task.node_id] = node_output.model_dump()
                else:
                    # Fallback - use the inputs directly
                    precomputed[paused_task.node_id] = action_request.inputs

            # Run the workflow with the precomputed outputs
            outputs = await executor.run(
                input={},  # Input already provided in initial run
                node_ids=list(nodes_to_run),  # Run the blocked nodes
                precomputed_outputs=precomputed,  # Use existing outputs plus our human input
            )

            # Create a dictionary of outputs - keep existing outputs and add new ones
            if run.outputs:
                combined_outputs = run.outputs
                for k, v in outputs.items():
                    combined_outputs[k] = v.model_dump()
                run.outputs = combined_outputs
            else:
                run.outputs = {k: v.model_dump() for k, v in outputs.items()}

            run.status = RunStatus.COMPLETED
            run.end_time = datetime.now(timezone.utc)
        except Exception as e:
            run.status = RunStatus.FAILED
            run.end_time = datetime.now(timezone.utc)
            logger.error(f"Error resuming workflow: {e}")
        db.commit()

    return resume_workflow_task


@router.post(
    "/cancel_workflow/{run_id}/",
    response_model=RunResponseSchema,
    description="Cancel a workflow that is awaiting human approval",
)
def cancel_workflow(
    run_id: str,
    db: Session = Depends(get_db),
) -> RunResponseSchema:
    """Cancel a workflow that is currently paused or awaiting human approval.

    This will mark the run as CANCELED in the database and update all pending tasks
    to CANCELED as well.

    Args:
        run_id: The ID of the run to cancel
        db: Database session dependency

    Returns:
        Information about the canceled run

    Raises:
        HTTPException: If the run is not found or not in a state that can be canceled

    """
    # Get the run
    run = db.query(RunModel).filter(RunModel.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Check if the run is in a state that can be canceled
    if run.status not in [RunStatus.PAUSED, RunStatus.RUNNING]:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Run is in state {run.status} and cannot be canceled."
                "Only PAUSED or RUNNING runs can be canceled."
            ),
        )

    # Update the run status
    run.status = RunStatus.CANCELED
    run.end_time = datetime.now(timezone.utc)

    # Update all pending and running tasks to canceled
    for task in run.tasks:
        if task.status in [TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.PAUSED]:
            task.status = TaskStatus.CANCELED
            if not task.end_time:
                task.end_time = datetime.now(timezone.utc)

    # Commit the changes
    db.commit()
    db.refresh(run)

    # Return the updated run
    response = RunResponseSchema.model_validate(run)
    response.message = "Workflow has been canceled successfully."
    return response

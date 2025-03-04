from datetime import datetime
from typing import Any, Dict, Optional, List

from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models.task_model import TaskModel, TaskStatus
from ..schemas.workflow_schemas import WorkflowDefinitionSchema


class TaskRecorder:
    def __init__(self, db: Session, run_id: str):
        self.db = db
        self.run_id = run_id
        self.tasks: Dict[str, TaskModel] = {}

        # Load existing tasks from the database
        existing_tasks = db.query(TaskModel).filter(TaskModel.run_id == run_id).all()

        # Group tasks by node_id
        node_tasks: Dict[str, List[TaskModel]] = {}
        for task in existing_tasks:
            if task.node_id not in node_tasks:
                node_tasks[task.node_id] = []
            node_tasks[task.node_id].append(task)

        # For each node_id, select the most relevant task
        for node_id, tasks in node_tasks.items():
            # If there's only one task, use it
            if len(tasks) == 1:
                self.tasks[node_id] = tasks[0]
                continue

            # If there are multiple tasks, prioritize:
            # 1. COMPLETED tasks
            # 2. PAUSED tasks
            # 3. RUNNING tasks
            # 4. PENDING tasks
            # 5. FAILED tasks
            # 6. CANCELED tasks

            # First, try to find a COMPLETED task
            completed_tasks = [t for t in tasks if t.status == TaskStatus.COMPLETED]
            if completed_tasks:
                # Use the most recently completed task
                self.tasks[node_id] = max(completed_tasks, key=lambda t: t.end_time or datetime.min)
                continue

            # Next, try to find a PAUSED task
            paused_tasks = [t for t in tasks if t.status == TaskStatus.PAUSED]
            if paused_tasks:
                self.tasks[node_id] = paused_tasks[0]
                continue

            # Next, try to find a RUNNING task
            running_tasks = [t for t in tasks if t.status == TaskStatus.RUNNING]
            if running_tasks:
                self.tasks[node_id] = running_tasks[0]
                continue

            # Next, try to find a PENDING task
            pending_tasks = [t for t in tasks if t.status == TaskStatus.PENDING]
            if pending_tasks:
                self.tasks[node_id] = pending_tasks[0]
                continue

            # Next, try to find a FAILED task
            failed_tasks = [t for t in tasks if t.status == TaskStatus.FAILED]
            if failed_tasks:
                self.tasks[node_id] = failed_tasks[0]
                continue

            # Finally, use a CANCELED task
            canceled_tasks = [t for t in tasks if t.status == TaskStatus.CANCELED]
            if canceled_tasks:
                self.tasks[node_id] = canceled_tasks[0]
                continue

            # If we get here, just use the first task
            self.tasks[node_id] = tasks[0]

    def create_task(
        self,
        node_id: str,
        inputs: Dict[str, Any],
    ):
        # First check if there's already a task for this node in our in-memory cache
        if node_id in self.tasks:
            existing_task = self.tasks[node_id]

            # If the existing task is COMPLETED, PAUSED, or RUNNING, don't create a new one
            if existing_task.status in [TaskStatus.COMPLETED, TaskStatus.PAUSED, TaskStatus.RUNNING]:
                # Just update the inputs if needed
                if inputs and not existing_task.inputs:
                    existing_task.inputs = inputs
                    self.db.add(existing_task)
                    self.db.commit()
                return

            # For other statuses (PENDING, FAILED, CANCELED), update the existing task
            existing_task.inputs = inputs
            existing_task.status = TaskStatus.RUNNING
            existing_task.start_time = datetime.now()
            existing_task.end_time = None
            existing_task.error = None
            self.db.add(existing_task)
            self.db.commit()
            self.db.refresh(existing_task)
            return

        # If we don't have a task in memory, check the database for any existing tasks
        existing_task = self.db.query(TaskModel).filter(
            TaskModel.run_id == self.run_id,
            TaskModel.node_id == node_id
        ).order_by(TaskModel.end_time.desc().nullslast()).first()

        if existing_task:
            # If there's an existing task in the database, use it
            if existing_task.status in [TaskStatus.COMPLETED, TaskStatus.PAUSED]:
                # Don't modify COMPLETED or PAUSED tasks
                self.tasks[node_id] = existing_task
                return

            # Update the existing task for other statuses
            existing_task.inputs = inputs
            existing_task.status = TaskStatus.RUNNING
            existing_task.start_time = datetime.now()
            existing_task.end_time = None
            existing_task.error = None
            self.db.add(existing_task)
            self.db.commit()
            self.db.refresh(existing_task)
            self.tasks[node_id] = existing_task
            return

        # If no existing task was found, create a new one
        task = TaskModel(
            run_id=self.run_id,
            node_id=node_id,
            inputs=inputs,
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        self.tasks[node_id] = task
        return

    def update_task(
        self,
        node_id: str,
        status: TaskStatus,
        inputs: Optional[Dict[str, Any]] = None,
        outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        subworkflow: Optional[WorkflowDefinitionSchema] = None,
        subworkflow_output: Optional[Dict[str, BaseModel]] = None,
        end_time: Optional[datetime] = None,
        is_downstream_of_pause: bool = False,
    ):
        task = self.tasks.get(node_id)
        if not task:
            self.create_task(node_id, inputs={})
            task = self.tasks[node_id]

        # If task is downstream of a paused node, mark it as pending instead of failed/canceled
        if is_downstream_of_pause and status in [TaskStatus.FAILED, TaskStatus.CANCELED]:
            status = TaskStatus.PENDING
            error = None  # Clear any error message

        task.status = status
        if inputs:
            task.inputs = inputs
        if outputs:
            task.outputs = outputs
        if error:
            task.error = error
        if end_time:
            task.end_time = end_time
        if subworkflow:
            task.subworkflow = subworkflow.model_dump()
        if subworkflow_output:
            task.subworkflow_output = {
                k: (
                    [x.model_dump() if isinstance(x, BaseModel) else x for x in v]
                    if isinstance(v, list)
                    else v.model_dump()
                )
                for k, v in subworkflow_output.items()
            }
        self.db.add(task)
        self.db.commit()
        return

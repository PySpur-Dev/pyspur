from datetime import datetime, timezone
from typing import Any, Dict

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy.orm import Session

from ..api.workflow_run import run_workflow_blocking_v2
from ..database import get_db
from ..models.workflow_model import WorkflowModel
from ..models.workflow_schedule_model import WorkflowScheduleModel
from ..schemas.run_schemas import StartRunRequestSchema
from ..schemas.schedule_schemas import (
    WorkflowScheduleCreateSchema,
    WorkflowScheduleListResponseSchema,
    WorkflowScheduleResponseSchema,
    WorkflowScheduleUpdateSchema,
)

router = APIRouter()


class SchedulerManager:
    """Manager for APScheduler integration with workflow schedules."""

    _instance = None

    def __new__(cls):
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super(SchedulerManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """Initialize the scheduler if it hasn't been initialized yet."""
        if self._initialized:
            return

        self.scheduler = None
        self._initialized = True

    def initialize(self, db_url: str):
        """Initialize the scheduler with the given database URL."""
        # Configure jobstore to use SQLAlchemy
        job_stores = {"default": SQLAlchemyJobStore(url=db_url)}

        # Create scheduler
        self.scheduler = BackgroundScheduler(
            jobstores=job_stores,
            job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 60},
        )

    def start(self):
        """Start the scheduler."""
        if not self.scheduler:
            raise ValueError("Scheduler not initialized. Call initialize() first.")

        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Scheduler started")

    def shutdown(self):
        """Shutdown the scheduler."""
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Scheduler shutdown")

    def sync_schedules(self, db: Session):
        """Synchronize database schedules with the scheduler."""
        if not self.scheduler:
            raise ValueError("Scheduler not initialized. Call initialize() first.")

        # Get all schedules from database
        schedules = db.query(WorkflowScheduleModel).all()

        # Get all jobs from scheduler
        scheduler_jobs = {job.id: job for job in self.scheduler.get_jobs()}

        # Add or update jobs
        for schedule in schedules:
            # Only add enabled schedules
            if schedule.enabled:
                # Check if job exists
                if schedule.id in scheduler_jobs:
                    # Update job if it exists
                    self._update_job(schedule)
                else:
                    # Add job if it doesn't exist
                    self._add_job(schedule)
            else:
                # Remove job if disabled and exists
                if schedule.id in scheduler_jobs:
                    self.scheduler.remove_job(schedule.id)

        # Remove jobs that don't have a schedule
        db_schedule_ids = {schedule.id for schedule in schedules}
        for job_id in scheduler_jobs:
            if job_id not in db_schedule_ids:
                self.scheduler.remove_job(job_id)

    def _add_job(self, schedule: WorkflowScheduleModel):
        """Add a job to the scheduler."""
        if not self.scheduler:
            raise ValueError("Scheduler not initialized. Call initialize() first.")

        try:
            # Calculate next run time
            trigger = CronTrigger.from_crontab(schedule.cron_expression)
            next_run_at = trigger.get_next_fire_time(None, datetime.now(timezone.utc))

            # Add job to scheduler
            self.scheduler.add_job(
                run_workflow_by_schedule,
                trigger=trigger,
                id=schedule.id,
                kwargs={
                    "workflow_id": schedule.workflow_id,
                    "schedule_id": schedule.id,
                    "initial_inputs": schedule.initial_inputs or {},
                },
                name=schedule.name,
                replace_existing=True,
            )

            # Update next run time in database
            with next(get_db()) as db:
                db_schedule = (
                    db.query(WorkflowScheduleModel)
                    .filter(WorkflowScheduleModel.id == schedule.id)
                    .first()
                )
                if db_schedule:
                    db_schedule.next_run_at = next_run_at
                    db.commit()

            logger.info(f"Added schedule job {schedule.id}: {schedule.name}")
        except Exception as e:
            logger.error(f"Error adding job {schedule.id}: {e}")

    def _update_job(self, schedule: WorkflowScheduleModel):
        """Update an existing job."""
        if not self.scheduler:
            raise ValueError("Scheduler not initialized. Call initialize() first.")

        try:
            # Remove existing job
            self.scheduler.remove_job(schedule.id)

            # Add job with updated parameters
            self._add_job(schedule)

            logger.info(f"Updated schedule job {schedule.id}: {schedule.name}")
        except Exception as e:
            logger.error(f"Error updating job {schedule.id}: {e}")

    def add_schedule(self, schedule: WorkflowScheduleModel):
        """Add a new schedule to the scheduler."""
        if not self.scheduler:
            raise ValueError("Scheduler not initialized. Call initialize() first.")

        if schedule.enabled:
            self._add_job(schedule)

    def update_schedule(self, schedule: WorkflowScheduleModel):
        """Update an existing schedule in the scheduler."""
        if not self.scheduler:
            raise ValueError("Scheduler not initialized. Call initialize() first.")

        if schedule.enabled:
            self._update_job(schedule)
        else:
            # Remove job if disabled
            try:
                self.scheduler.remove_job(schedule.id)
            except Exception:
                pass  # Job may not exist

    def remove_schedule(self, schedule_id: str):
        """Remove a schedule from the scheduler."""
        if not self.scheduler:
            raise ValueError("Scheduler not initialized. Call initialize() first.")

        try:
            self.scheduler.remove_job(schedule_id)
            logger.info(f"Removed schedule job {schedule_id}")
        except Exception as e:
            logger.error(f"Error removing job {schedule_id}: {e}")


# Singleton instance
scheduler_manager = SchedulerManager()


async def run_workflow_by_schedule(
    workflow_id: str, schedule_id: str, initial_inputs: Dict[str, Any] = None
):
    """Run a workflow by schedule ID."""
    try:
        logger.info(f"Running scheduled workflow {workflow_id} (schedule: {schedule_id})")

        # Use a new database session for this run
        with next(get_db()) as db:
            # Create run request
            request = StartRunRequestSchema(initial_inputs=initial_inputs or {}, parent_run_id=None)

            # Run the workflow
            result = await run_workflow_blocking_v2(
                workflow_id=workflow_id,
                request=request,
                db=db,
                run_type="scheduled",
            )

            # Update last_run_at field
            schedule = (
                db.query(WorkflowScheduleModel)
                .filter(WorkflowScheduleModel.id == schedule_id)
                .first()
            )

            if schedule:
                schedule.last_run_at = datetime.now(timezone.utc)

                # Calculate next run time
                trigger = CronTrigger.from_crontab(schedule.cron_expression)
                schedule.next_run_at = trigger.get_next_fire_time(None, datetime.now(timezone.utc))

                db.commit()

            logger.info(f"Completed scheduled workflow {workflow_id} (schedule: {schedule_id})")

            return result

    except Exception as e:
        logger.error(
            f"Error running scheduled workflow {workflow_id} (schedule: {schedule_id}): {e}"
        )
        raise e


@router.post(
    "/", response_model=WorkflowScheduleResponseSchema, description="Create a new workflow schedule"
)
def create_schedule(
    schedule_request: WorkflowScheduleCreateSchema,
    db: Session = Depends(get_db),
) -> WorkflowScheduleResponseSchema:
    """Create a new workflow schedule."""
    # Verify the workflow exists
    workflow = (
        db.query(WorkflowModel).filter(WorkflowModel.id == schedule_request.workflow_id).first()
    )
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Create the schedule
    new_schedule = WorkflowScheduleModel(
        workflow_id=schedule_request.workflow_id,
        name=schedule_request.name,
        cron_expression=schedule_request.cron_expression,
        initial_inputs=schedule_request.initial_inputs,
        enabled=schedule_request.enabled,
    )

    db.add(new_schedule)
    db.commit()
    db.refresh(new_schedule)

    # Add to scheduler if enabled
    if new_schedule.enabled:
        scheduler_manager.add_schedule(new_schedule)

    return new_schedule


@router.get(
    "/", response_model=WorkflowScheduleListResponseSchema, description="List workflow schedules"
)
def list_schedules(
    workflow_id: str = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
) -> WorkflowScheduleListResponseSchema:
    """List workflow schedules, optionally filtered by workflow ID."""
    query = db.query(WorkflowScheduleModel)

    # Filter by workflow ID if provided
    if workflow_id:
        query = query.filter(WorkflowScheduleModel.workflow_id == workflow_id)

    # Get total count
    total = query.count()

    # Apply pagination
    offset = (page - 1) * page_size
    schedules = (
        query.order_by(WorkflowScheduleModel.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return WorkflowScheduleListResponseSchema(
        schedules=schedules,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{schedule_id}",
    response_model=WorkflowScheduleResponseSchema,
    description="Get a workflow schedule by ID",
)
def get_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
) -> WorkflowScheduleResponseSchema:
    """Get a workflow schedule by ID."""
    schedule = (
        db.query(WorkflowScheduleModel).filter(WorkflowScheduleModel.id == schedule_id).first()
    )

    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    return schedule


@router.put(
    "/{schedule_id}",
    response_model=WorkflowScheduleResponseSchema,
    description="Update a workflow schedule",
)
def update_schedule(
    schedule_id: str,
    schedule_request: WorkflowScheduleUpdateSchema,
    db: Session = Depends(get_db),
) -> WorkflowScheduleResponseSchema:
    """Update a workflow schedule."""
    # Get the schedule
    schedule = (
        db.query(WorkflowScheduleModel).filter(WorkflowScheduleModel.id == schedule_id).first()
    )

    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Update fields
    if schedule_request.name is not None:
        schedule.name = schedule_request.name

    if schedule_request.cron_expression is not None:
        schedule.cron_expression = schedule_request.cron_expression

    if schedule_request.initial_inputs is not None:
        schedule.initial_inputs = schedule_request.initial_inputs

    if schedule_request.enabled is not None:
        schedule.enabled = schedule_request.enabled

    db.commit()
    db.refresh(schedule)

    # Update in scheduler
    scheduler_manager.update_schedule(schedule)

    return schedule


@router.delete("/{schedule_id}", description="Delete a workflow schedule")
def delete_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
):
    """Delete a workflow schedule."""
    # Get the schedule
    schedule = (
        db.query(WorkflowScheduleModel).filter(WorkflowScheduleModel.id == schedule_id).first()
    )

    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Remove from scheduler
    scheduler_manager.remove_schedule(schedule_id)

    # Delete from database
    db.delete(schedule)
    db.commit()

    return {"message": f"Schedule {schedule_id} deleted successfully"}


@router.post(
    "/{schedule_id}/toggle",
    response_model=WorkflowScheduleResponseSchema,
    description="Toggle a workflow schedule's enabled status",
)
def toggle_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
) -> WorkflowScheduleResponseSchema:
    """Toggle a workflow schedule's enabled status."""
    # Get the schedule
    schedule = (
        db.query(WorkflowScheduleModel).filter(WorkflowScheduleModel.id == schedule_id).first()
    )

    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Toggle enabled status
    schedule.enabled = not schedule.enabled

    db.commit()
    db.refresh(schedule)

    # Update in scheduler
    scheduler_manager.update_schedule(schedule)

    return schedule

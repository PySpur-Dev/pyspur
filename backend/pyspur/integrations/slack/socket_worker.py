#!/usr/bin/env python
"""Standalone worker for Slack Socket Mode connections.
This allows the socket connections to run in separate processes from the main API.
"""

import asyncio
import logging
import os
import random
import signal
import sys
import time
from typing import Any, Dict, List, Set

from loguru import logger
from sqlalchemy.orm import Session, configure_mappers

from ...database import get_db
from ...models.slack_agent_model import SlackAgentModel

# Import related models to ensure SQLAlchemy relationships are properly initialized
from ...models.workflow_model import WorkflowModel  # noqa: F401
from ...models.workflow_version_model import WorkflowVersionModel  # noqa: F401
from .socket_client import SocketModeClient, get_socket_mode_client

# Try to import psutil for zombie process detection
try:
    import psutil

    HAVE_PSUTIL = True
except ImportError:
    HAVE_PSUTIL = False
    logger.warning("psutil not available, zombie socket process detection disabled")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger.info("Starting Slack Socket Mode Worker")

# Socket health check interval (in seconds)
HEALTH_CHECK_INTERVAL = 30

# Default monitor refresh interval (in seconds)
DEFAULT_REFRESH_INTERVAL = 15

# Maximum backoff time for reconnection attempts (in seconds)
MAX_BACKOFF = 300

# Maximum time to wait for a socket to stop before taking more drastic measures (in seconds)
MAX_SOCKET_STOP_WAIT = 3

# Track socket connection failures
connection_failures: Dict[int, int] = {}
# Track reconnection attempts to implement backoff
reconnection_attempts: Dict[int, int] = {}
# Track sockets that have been verified as healthy
healthy_sockets: Set[int] = set()
# Counter to track the number of consecutive shutdown failures
shutdown_failures = 0

# Import handler functions from slack_management
from ...api.slack_management import handle_socket_mode_event_sync

configure_mappers()

# Set the workflow trigger callback
socket_client = get_socket_mode_client()
socket_client.set_workflow_trigger_callback(handle_socket_mode_event_sync)
logger.info("Set workflow trigger callback for socket worker")


def get_active_agents(db: Session) -> List[SlackAgentModel]:
    """Get all active agents that have socket mode enabled"""
    agents = (
        db.query(SlackAgentModel)
        .filter(
            SlackAgentModel.is_active,  # Boolean columns can be used directly as criteria
            SlackAgentModel.trigger_enabled,
            SlackAgentModel.has_bot_token,
            SlackAgentModel.workflow_id.isnot(None),
            SlackAgentModel.socket_mode_enabled.is_(
                True
            ),  # Only get agents with socket mode enabled
        )
        .all()
    )
    return agents


async def check_socket_health(socket_client: SocketModeClient, agent_ids: Set[int]):
    """Periodically check the health of all active socket connections

    Args:
        socket_client: The SocketModeClient instance
        agent_ids: Set of agent IDs that should have active sockets

    """
    while True:
        try:
            for agent_id in agent_ids:
                # Skip if the connection is already known to be unhealthy
                if agent_id not in healthy_sockets:
                    continue

                # Check if the socket connection is still active
                if not socket_client.is_running(agent_id):
                    logger.warning(f"Socket for agent {agent_id} is no longer running")
                    healthy_sockets.discard(agent_id)
                    # Mark for reconnection in the next monitor cycle
                    connection_failures[agent_id] = connection_failures.get(agent_id, 0) + 1
        except Exception as e:
            logger.error(f"Error in socket health check: {e}")

        await asyncio.sleep(HEALTH_CHECK_INTERVAL)


def calculate_backoff(agent_id: int) -> float:
    """Calculate reconnection backoff time using exponential backoff with jitter

    Args:
        agent_id: The agent ID to calculate backoff for

    Returns:
        Backoff time in seconds

    """
    attempt = reconnection_attempts.get(agent_id, 0)
    if attempt == 0:
        return 0

    # Exponential backoff with cap
    base_delay = min(MAX_BACKOFF, 2 ** min(attempt, 8))
    # Add jitter (random value between 0 and 1)
    jitter = random.random()
    return base_delay + jitter


# Function to find and kill zombie slack processes - simplified to avoid psutil issues
def kill_zombie_slack_processes() -> int:
    """Find and kill any zombie Slack socket processes

    Returns:
        The number of processes killed

    """
    # Disabled due to psutil compatibility issues - just return 0 silently
    return 0


async def monitor_and_restart_sockets(
    socket_client: SocketModeClient, refresh_interval: int = DEFAULT_REFRESH_INTERVAL
):
    """Monitor active agents and start/restart socket connections as needed

    Args:
        socket_client: The SocketModeClient instance
        refresh_interval: How often to check for new agents (in seconds)

    """
    active_agent_ids: Dict[int, bool] = {}  # Maps agent_id to active status
    # Keep track of socket_mode_enabled status per agent
    socket_enabled_status: Dict[int, bool] = {}
    # Track sockets we've tried to stop but may need additional force-stopping
    socket_cleanup_attempts: Dict[int, int] = {}

    # Log once at startup that zombie detection is disabled
    logger.warning("Zombie process detection is disabled due to psutil compatibility issues")

    while True:
        try:
            # Check for zombie socket processes - disabled due to psutil issues
            try:
                # This is now a no-op but we keep the structure in case we need to re-enable later
                kill_zombie_slack_processes()
            except Exception as e:
                logger.error(f"Error in zombie process detection: {e}")

            db = next(get_db())
            try:
                # First check all existing sockets to see if any should be forcibly stopped
                # This performs a more targeted check before the broader agent scan
                for agent_id in list(active_agent_ids.keys()):
                    try:
                        # Get the current agent status directly to ensure we have latest data
                        agent = (
                            db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
                        )

                        if not agent:
                            logger.warning(f"Agent {agent_id} no longer exists, stopping socket")
                            socket_client.stop_socket_mode(agent_id)
                            logger.debug(
                                f"After stop for nonexistent agent {agent_id}, handlers: {list(socket_client._socket_mode_handlers.keys())}"
                            )
                            if agent_id in healthy_sockets:
                                healthy_sockets.remove(agent_id)
                            # Remove from active agents to prevent restart
                            if agent_id in active_agent_ids:
                                del active_agent_ids[agent_id]
                            # Clear any failure tracking
                            if agent_id in connection_failures:
                                del connection_failures[agent_id]
                            if agent_id in reconnection_attempts:
                                del reconnection_attempts[agent_id]
                            if agent_id in socket_cleanup_attempts:
                                del socket_cleanup_attempts[agent_id]
                            continue

                        # Check if socket_mode_enabled is explicitly False
                        socket_mode_enabled = bool(agent.socket_mode_enabled)
                        if not socket_mode_enabled:
                            global shutdown_failures

                            logger.debug(
                                f"Agent {agent_id} has socket_mode_enabled=False, stopping socket"
                            )
                            result = socket_client.stop_socket_mode(agent_id)
                            logger.debug(f"Stop result for agent {agent_id}: {result}")
                            logger.debug(
                                f"After stop, handlers: {list(socket_client._socket_mode_handlers.keys())}"
                            )

                            # Wait briefly to see if socket actually stopped
                            for _ in range(MAX_SOCKET_STOP_WAIT):
                                if not socket_client.is_running(agent_id):
                                    break
                                # Socket is still running - wait and check again
                                time.sleep(1)

                            # If socket is STILL running after our wait, take more drastic measures
                            if socket_client.is_running(agent_id):
                                logger.warning(
                                    f"Socket for agent {agent_id} STILL running after {MAX_SOCKET_STOP_WAIT}s - taking drastic measures"
                                )
                                shutdown_failures += 1

                                # If we've had multiple failures, consider forcibly restarting the entire service
                                if shutdown_failures >= 3:
                                    logger.critical(
                                        f"Multiple socket shutdown failures detected ({shutdown_failures}). Forcibly terminating process!"
                                    )
                                    # Force a process restart by exiting with non-zero code
                                    # Docker or supervisor should restart the process
                                    os._exit(1)  # More forceful than sys.exit()
                            else:
                                # Reset counter if we successfully stopped
                                shutdown_failures = 0

                            if agent_id in healthy_sockets:
                                healthy_sockets.remove(agent_id)
                            # Remove from active agents to prevent restart
                            if agent_id in active_agent_ids:
                                del active_agent_ids[agent_id]
                            # Clear any failure tracking
                            if agent_id in connection_failures:
                                del connection_failures[agent_id]
                            if agent_id in reconnection_attempts:
                                del reconnection_attempts[agent_id]

                            # Track this socket for additional cleanup if needed
                            socket_cleanup_attempts[agent_id] = (
                                socket_cleanup_attempts.get(agent_id, 0) + 1
                            )
                            logger.debug(
                                f"Updated socket_cleanup_attempts for {agent_id}: {socket_cleanup_attempts[agent_id]}"
                            )

                        # Double check that socket is truly stopped when it should be
                        if not socket_mode_enabled and socket_client.is_running(agent_id):
                            logger.warning(
                                f"Socket for agent {agent_id} is still running despite being disabled, forcing stop"
                            )
                            socket_client.stop_socket_mode(agent_id)

                            # If we've tried to stop this socket multiple times, take more drastic measures
                            cleanup_attempts = socket_cleanup_attempts.get(agent_id, 0)
                            if cleanup_attempts >= 3:
                                logger.warning(
                                    f"Multiple attempts to stop socket for agent {agent_id} failed, using force cleanup"
                                )
                                # Access internal state to force removal
                                if (
                                    hasattr(socket_client, "_socket_mode_handlers")
                                    and agent_id in socket_client._socket_mode_handlers
                                ):
                                    try:
                                        # Try one more time with direct access
                                        handler = socket_client._socket_mode_handlers[agent_id]
                                        if hasattr(handler, "close"):
                                            handler.close()
                                        # Force remove from internal tracking
                                        del socket_client._socket_mode_handlers[agent_id]
                                        logger.info(
                                            f"Forced cleanup of socket handler for agent {agent_id}"
                                        )
                                    except Exception as cleanup_error:
                                        logger.error(
                                            f"Error during forced socket cleanup: {cleanup_error}"
                                        )

                                # Reset counters after force cleanup
                                if agent_id in socket_cleanup_attempts:
                                    del socket_cleanup_attempts[agent_id]

                    except Exception as e:
                        logger.error(f"Error checking agent {agent_id} socket status: {e}")
                        # If we can't check, try to stop it anyway as a safety measure
                        socket_client.stop_socket_mode(agent_id)

                # Now continue with the regular scan for agents that should have active sockets
                # Get all agents that should have active socket connections
                agents = get_active_agents(db)
                # Extract the integer IDs from SQLAlchemy objects
                current_agent_ids = {int(agent.id): True for agent in agents}

                # Also track which agents have socket mode explicitly enabled
                current_socket_enabled = {
                    int(agent.id): bool(agent.socket_mode_enabled)
                    for agent in db.query(SlackAgentModel)
                    .filter(
                        SlackAgentModel.is_active,
                        SlackAgentModel.has_bot_token,
                        SlackAgentModel.workflow_id.isnot(None),
                    )
                    .all()
                }

                # Find agents that need to be started/restarted
                for agent_id in current_agent_ids:
                    # Calculate backoff for this agent
                    backoff_time = calculate_backoff(agent_id)

                    # Skip this agent if we're in a backoff period
                    if backoff_time > 0:
                        logger.info(
                            f"In backoff period for agent {agent_id}, waiting {backoff_time:.1f}s before retry"
                        )
                        # Reduce the backoff counter for next time
                        reconnection_attempts[agent_id] = max(
                            0, reconnection_attempts.get(agent_id, 0) - 1
                        )
                        continue

                    # Check if we need to start or restart this socket
                    if agent_id not in active_agent_ids or not socket_client.is_running(agent_id):
                        logger.info(f"Starting socket for agent {agent_id}")
                        success = socket_client.start_socket_mode(agent_id)

                        if success:
                            logger.info(f"Successfully started socket for agent {agent_id}")
                            healthy_sockets.add(agent_id)
                            # Reset failure counter
                            connection_failures[agent_id] = 0
                            reconnection_attempts[agent_id] = 0
                        else:
                            logger.error(f"Failed to start socket for agent {agent_id}")
                            if agent_id in healthy_sockets:
                                healthy_sockets.remove(agent_id)
                            # Increment failure counter
                            connection_failures[agent_id] = connection_failures.get(agent_id, 0) + 1
                            reconnection_attempts[agent_id] = (
                                reconnection_attempts.get(agent_id, 0) + 1
                            )

                # Check for agents where socket_mode_enabled has been switched off
                for agent_id, was_enabled in socket_enabled_status.items():
                    # If it was enabled before but now disabled, stop the socket
                    if (
                        was_enabled
                        and agent_id in current_socket_enabled
                        and not current_socket_enabled[agent_id]
                    ):
                        logger.info(
                            f"Stopping socket for agent {agent_id} - socket_mode_enabled turned off"
                        )
                        socket_client.stop_socket_mode(agent_id)
                        if agent_id in healthy_sockets:
                            healthy_sockets.remove(agent_id)
                        # Clear any failure tracking
                        if agent_id in connection_failures:
                            del connection_failures[agent_id]
                        if agent_id in reconnection_attempts:
                            del reconnection_attempts[agent_id]

                # Stop sockets for agents that are no longer active
                for agent_id in list(active_agent_ids.keys()):
                    if agent_id not in current_agent_ids:
                        logger.info(
                            f"Stopping socket for agent {agent_id} - agent no longer active"
                        )
                        socket_client.stop_socket_mode(agent_id)
                        if agent_id in healthy_sockets:
                            healthy_sockets.remove(agent_id)
                        # Clear any failure tracking
                        if agent_id in connection_failures:
                            del connection_failures[agent_id]
                        if agent_id in reconnection_attempts:
                            del reconnection_attempts[agent_id]

                # Before updating our tracking, verify all reported active sockets are truly active
                for agent_id in list(socket_client._socket_mode_handlers.keys()):
                    # If this socket should be disabled but is still connected somehow
                    if agent_id in current_socket_enabled and not current_socket_enabled[agent_id]:
                        logger.warning(
                            f"Found lingering socket connection for agent {agent_id}, forcing close"
                        )
                        socket_client.stop_socket_mode(agent_id)

                # Update our tracking of active agents
                active_agent_ids = current_agent_ids
                # Update our tracking of socket_mode_enabled status
                socket_enabled_status = current_socket_enabled

                # Log status summary
                if active_agent_ids:
                    logger.debug(
                        f"Socket status: {len(healthy_sockets)}/{len(active_agent_ids)} connections healthy"
                    )

            except Exception as e:
                logger.error(f"Error in socket monitor: {e}")
                import traceback

                logger.error(f"Traceback: {traceback.format_exc()}")
            finally:
                db.close()

            # Sleep before checking again
            await asyncio.sleep(refresh_interval)

        except Exception as e:
            logger.error(f"Critical error in monitor_and_restart_sockets: {e}")
            import traceback

            logger.error(f"Traceback: {traceback.format_exc()}")
            await asyncio.sleep(refresh_interval)


def setup_shutdown_handler(socket_client: SocketModeClient):
    """Set up signal handlers for graceful shutdown"""

    def handle_shutdown(signum: int, frame: Any) -> None:
        logger.info(f"Received signal {signum}, shutting down")
        socket_client.stop_all()
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)


async def main():
    """Main entry point for the worker"""
    # Initialize the socket client
    socket_client = get_socket_mode_client()

    # Set up shutdown handlers
    setup_shutdown_handler(socket_client)

    # Print worker info
    worker_id = os.environ.get("HOSTNAME", "unknown")
    logger.info(f"Socket worker {worker_id} started")

    # Add a brief delay to ensure database is ready
    await asyncio.sleep(5)

    # Start the monitor task
    monitor_task = asyncio.create_task(monitor_and_restart_sockets(socket_client))

    # Start the health check task
    health_check_task = asyncio.create_task(check_socket_health(socket_client, healthy_sockets))

    try:
        # Keep the worker running
        while True:
            await asyncio.sleep(3600)  # Sleep for an hour
    except asyncio.CancelledError:
        # Cancel the tasks
        monitor_task.cancel()
        health_check_task.cancel()
        try:
            await asyncio.gather(monitor_task, health_check_task, return_exceptions=True)
        except asyncio.CancelledError:
            pass
    finally:
        # Ensure all sockets are stopped
        socket_client.stop_all()


if __name__ == "__main__":
    # Run the main function
    asyncio.run(main())

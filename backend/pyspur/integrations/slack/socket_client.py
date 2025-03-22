import asyncio
import logging
import os
import threading
import traceback
from datetime import datetime
from typing import Any, Callable, Dict, Optional, Set

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
from slack_bolt.oauth.oauth_settings import OAuthSettings
from slack_sdk.oauth.installation_store import FileInstallationStore
from slack_sdk.oauth.installation_store.models.installation import Installation
from slack_sdk.oauth.state_store import FileOAuthStateStore

from ...database import get_db
from ...models.slack_agent_model import SlackAgentModel
from ...schemas.slack_schemas import WorkflowTriggerRequest

logger = logging.getLogger("pyspur")


class SocketModeClient:
    """Client for handling Slack Socket Mode connections.
    This manages real-time event processing from Slack.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(SocketModeClient, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return

        # Initialize state
        self._socket_mode_handlers: Dict[int, SocketModeHandler] = {}
        self._apps: Dict[int, App] = {}
        self._initialized = True
        self._workflow_trigger_callback: Optional[Callable[..., Any]] = None
        # Blacklist for agents that should be ignored even if events are received
        self._blacklisted_agents: Set[int] = set()
        # Track running background tasks/threads for proper cleanup
        self._socket_tasks: Dict[int, Any] = {}
        # Track session tokens to forcibly disconnect Slack sessions
        self._session_tokens: Dict[int, str] = {}

        # Create a base directory for installation data
        os.makedirs("/tmp/slack-installation-store", exist_ok=True)

        logger.info("SocketModeClient initialized")

    def set_workflow_trigger_callback(self, callback: Callable[..., Any]):
        """Set the callback function to be called when a workflow should be triggered

        The callback can be either a regular function or an async coroutine function.
        If it's a coroutine function, it will be properly awaited when called.
        """
        self._workflow_trigger_callback = callback
        # Log whether the callback is a coroutine function
        is_async = asyncio.iscoroutinefunction(callback)
        logger.info(f"Setting workflow trigger callback. Is async: {is_async}")

    def _register_event_handlers(self, app: App, agent_id: int):
        """Register event handlers for the Slack app"""

        @app.event("app_mention")
        def handle_app_mention(
            event: Dict[str, Any],
            say: Callable,
            body: Dict[str, Any],
            logger: logging.Logger,
            client,
        ):
            """Handle app mention events from Slack"""
            logger.info(f"Agent {agent_id} received mention: {event}")
            self._process_event(agent_id, "app_mention", event, body, say, client)

        @app.event("message")
        def handle_message(
            event: Dict[str, Any],
            say: Callable,
            body: Dict[str, Any],
            logger: logging.Logger,
            client,
        ):
            """Handle message events from Slack"""
            # Skip bot messages to avoid loops
            if event.get("bot_id") or event.get("user") == "USLACKBOT":
                return

            logger.info(f"Agent {agent_id} received message: {event}")
            self._process_event(agent_id, "message", event, body, say, client)

        # Add error handler for app
        @app.error
        def handle_errors(error: Exception, logger: logging.Logger):
            """Handle any errors that occur during event processing"""
            logger.error(f"Error in Slack app for agent {agent_id}: {error}")

            # Log detailed error information for debugging
            logger.error(f"Error details: {traceback.format_exc()}")

    def _process_event(
        self,
        agent_id: int,
        event_type: str,
        event: Dict[str, Any],
        body: Dict[str, Any],
        say: Callable,
        client=None,
    ):
        """Process a Slack event and trigger workflows if appropriate"""
        # Add diagnostics about the event
        logger.info(f"Received {event_type} event for agent {agent_id}")
        logger.info(f"Current blacklist: {self._blacklisted_agents}")

        # Check if this agent is blacklisted - if so, ignore this event
        if agent_id in self._blacklisted_agents:
            logger.warning(f"Received event for blacklisted agent {agent_id}, ignoring")
            return

        if not self._workflow_trigger_callback:
            logger.error("No workflow trigger callback set")
            return

        # Get a database session
        db = next(get_db())

        try:
            # Get the agent to verify it exists and is active
            agent = (
                db.query(SlackAgentModel)
                .filter(
                    SlackAgentModel.id == agent_id,
                    SlackAgentModel.is_active.is_(True),
                    SlackAgentModel.trigger_enabled.is_(True),
                    SlackAgentModel.socket_mode_enabled.is_(True),
                )
                .first()
            )

            if not agent:
                # Check specifically for socket_mode_enabled to provide better logging
                socket_check = (
                    db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
                )
                if socket_check and not getattr(socket_check, "socket_mode_enabled", False):
                    logger.warning(
                        f"Received event for agent {agent_id} but socket_mode_enabled is False. "
                        f"This event should not have been received. Ignoring."
                    )
                    # Add to blacklist to prevent future events
                    self._blacklisted_agents.add(agent_id)
                    logger.info(f"Updated blacklist to: {self._blacklisted_agents}")
                else:
                    logger.warning(f"Agent {agent_id} not found or not active")
                return

            # Extract relevant information from the event
            text = event.get("text", "")
            channel_id = event.get("channel", "")
            user_id = event.get("user", "")
            team_id = body.get("team_id", "")

            # Create a trigger request
            trigger_request = WorkflowTriggerRequest(
                text=text,
                channel_id=channel_id,
                user_id=user_id,
                team_id=team_id,
                event_type=event_type,
                event_data=event,
            )

            # Call the workflow trigger callback
            # Check if the callback is a coroutine function
            callback_result = self._workflow_trigger_callback(
                trigger_request, agent_id, say, client
            )

            # If it's a coroutine, we need to run it in an event loop
            if asyncio.iscoroutine(callback_result):
                try:
                    # Try to get the current event loop
                    try:
                        loop = asyncio.get_event_loop()
                    except RuntimeError:
                        # If there's no event loop in this thread, create a new one
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)

                    # Run the coroutine
                    if loop.is_running():
                        # We're in an event loop but in a non-async context
                        # Schedule the coroutine to run soon
                        future = asyncio.run_coroutine_threadsafe(callback_result, loop)
                        # Optionally wait for it to complete with a timeout
                        # future.result(timeout=10)
                    else:
                        # We can run the coroutine directly
                        loop.run_until_complete(callback_result)
                except Exception as e:
                    logger.error(f"Error executing coroutine: {e}")
                    logger.error(f"Coroutine error details: {traceback.format_exc()}")

        except Exception as e:
            logger.error(f"Error processing event for agent {agent_id}: {e}")
            logger.error(f"Error details: {traceback.format_exc()}")
        finally:
            db.close()

    def start_socket_mode(self, agent_id: int) -> bool:
        """Start socket mode for a Slack agent"""
        logger.info(f"Starting socket mode for agent {agent_id}")

        # First make sure any existing socket is stopped
        if agent_id in self._socket_mode_handlers:
            logger.info(f"Stopping existing socket for agent {agent_id} before restart")
            self.stop_socket_mode(agent_id)

        # Remove from blacklist if it's there
        if agent_id in self._blacklisted_agents:
            self._blacklisted_agents.remove(agent_id)
            logger.info(f"Removed agent {agent_id} from blacklist for restart")

        # Get a database session
        db = next(get_db())

        try:
            # Get the agent
            agent = db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()

            if not agent:
                logger.error(f"Agent {agent_id} not found")
                return False

            # Get the tokens from the agent
            bot_token = getattr(agent, "slack_bot_token", None)
            app_token = getattr(agent, "slack_app_token", None)

            # Initialize token store once to avoid redundant imports
            from ...api.secure_token_store import get_token_store

            token_store = get_token_store()

            # Try to get tokens from secure token store if not available on agent
            if not bot_token:
                bot_token = token_store.get_token(agent_id, "bot_token")

            if not app_token:
                app_token = token_store.get_token(agent_id, "app_token")

            # For Socket Mode, signing secret is optional
            signing_secret = getattr(
                agent, "slack_signing_secret", os.environ.get("SLACK_SIGNING_SECRET")
            )

            if not bot_token or not bot_token.startswith("xoxb-"):
                logger.error(f"Invalid bot token format for agent {agent_id}")
                return False

            if not app_token or not app_token.startswith("xapp-"):
                logger.error(f"Invalid app token format for agent {agent_id}")
                return False

            try:
                # Create unique installation store path for this agent
                installation_store_path = f"/tmp/slack-installation-store/{agent_id}"
                os.makedirs(installation_store_path, exist_ok=True)

                # Create installation store
                installation_store = FileInstallationStore(base_dir=installation_store_path)

                # Create OAuth settings with installation store
                oauth_settings = OAuthSettings(
                    client_id=os.environ.get("SLACK_CLIENT_ID", ""),
                    client_secret=os.environ.get("SLACK_CLIENT_SECRET", ""),
                    scopes=["chat:write", "app_mentions:read", "channels:history", "channels:read"],
                    installation_store=installation_store,
                    state_store=FileOAuthStateStore(
                        base_dir=installation_store_path, expiration_seconds=600
                    ),
                )

                # Create the app with OAuth settings
                app = App(
                    token=bot_token, signing_secret=signing_secret, oauth_settings=oauth_settings
                )

                # Manually store the installation data for this workspace
                # Get bot info to retrieve the bot_id, bot_user_id, and team_id
                bot_info_response = app.client.auth_test()
                if not bot_info_response["ok"]:
                    logger.error(f"Failed to get bot info: {bot_info_response['error']}")
                    return False

                team_id = bot_info_response["team_id"]
                bot_user_id = bot_info_response["user_id"]

                # Create and store installation data
                installation = Installation(
                    app_id=os.environ.get("SLACK_APP_ID", bot_info_response.get("bot_id", "")),
                    enterprise_id=None,
                    team_id=team_id,
                    user_id=bot_user_id,
                    bot_token=bot_token,
                    bot_id=bot_info_response.get("bot_id", ""),
                    bot_user_id=bot_user_id,
                    bot_scopes=[
                        "chat:write",
                        "app_mentions:read",
                        "channels:history",
                        "channels:read",
                    ],
                    installed_at=datetime.now().timestamp(),
                )

                # Store the installation data
                installation_store.save(installation)
                logger.info(f"Stored installation data for team_id: {team_id}")

                # Register event handlers
                self._register_event_handlers(app, agent_id)

                # Start socket mode
                logger.info(f"Starting socket mode with app token for agent {agent_id}")
                socket_handler = SocketModeHandler(app=app, app_token=app_token)
                socket_handler.start()

                # Store the handler reference for later stop
                self._socket_mode_handlers[agent_id] = socket_handler
                self._apps[agent_id] = app

                # Store any background tasks/threads the handler has created
                if hasattr(socket_handler, "thread") and socket_handler.thread:
                    self._socket_tasks[agent_id] = socket_handler.thread
                    logger.info(f"Stored background thread for agent {agent_id}")

                logger.info(f"Socket mode started successfully for agent {agent_id}")
                return True

            except Exception as e:
                # Handle exception from socket mode initialization
                logger.error(f"Error starting socket mode for agent {agent_id}: {e}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                return False
        except Exception as e:
            logger.error(f"Error in socket mode setup for agent {agent_id}: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False
        finally:
            db.close()

    def stop_socket_mode(self, agent_id: int) -> bool:
        """Stop Socket Mode for a specific agent"""
        logger.info(f"Stopping Socket Mode for agent {agent_id}")

        # Add agent to blacklist to reject any incoming events
        self._blacklisted_agents.add(agent_id)
        logger.info(f"Added agent {agent_id} to blacklist: {self._blacklisted_agents}")

        # ========== FORCIBLY DISCONNECT SLACK SESSIONS USING APP TOKEN ==========
        # This is a more aggressive approach that terminates the connection at Slack's side
        self._forcibly_disconnect_slack_sessions(agent_id)

        # First check if we have a task/thread to terminate
        if agent_id in self._socket_tasks:
            thread = self._socket_tasks[agent_id]
            logger.info(f"Found background thread for agent {agent_id}: {thread}")
            try:
                # Check thread type and try to terminate it
                if hasattr(thread, "is_alive") and thread.is_alive():
                    logger.info("Thread is alive, attempting to terminate")
                    if hasattr(thread, "_stop"):
                        thread._stop()
                    if hasattr(thread, "_terminate"):
                        thread._terminate()
                    # Wait a moment for the thread to terminate
                    import time

                    time.sleep(0.5)
                    logger.info(f"Thread alive after terminate: {thread.is_alive()}")
            except Exception as e:
                logger.error(f"Error terminating thread for agent {agent_id}: {e}")
            finally:
                # Remove from our tracking regardless of success
                del self._socket_tasks[agent_id]

        if agent_id not in self._socket_mode_handlers:
            logger.warning(f"No Socket Mode handler found for agent {agent_id}")
            return False

        # Try to close any of the various components that might be keeping the connection alive
        try:
            # Close the socket mode handler
            handler = self._socket_mode_handlers[agent_id]

            # Log handler details for debugging
            logger.info(f"Handler type: {type(handler)}")
            logger.info(f"Handler attributes: {dir(handler)}")

            # Try to examine the WebSocket connection if possible
            if hasattr(handler, "client") and handler.client:
                logger.info(f"Client type: {type(handler.client)}")
                logger.info(f"Client attributes: {dir(handler.client)}")
                if hasattr(handler.client, "is_connected") and callable(
                    getattr(handler.client, "is_connected", None)
                ):
                    logger.info(f"Client connected status: {handler.client.is_connected()}")

            # First, attempt to kill the WebSocket connection
            try:
                # Access underlying WebSocket client (may vary based on slack_bolt implementation)
                if hasattr(handler, "client") and handler.client:
                    logger.info(f"Shutting down WebSocket client for agent {agent_id}")
                    # Force a disconnect if possible
                    if hasattr(handler.client, "disconnect"):
                        handler.client.disconnect()
                    if hasattr(handler.client, "close"):
                        handler.client.close()

                # Access the app connection
                if hasattr(handler, "app") and handler.app:
                    if hasattr(handler.app, "stop"):
                        logger.info(f"Stopping app for agent {agent_id}")
                        handler.app.stop()
            except Exception as e:
                logger.error(f"Error during WebSocket cleanup: {e}")

            # Try to close the app first to stop any running listeners/callbacks
            if agent_id in self._apps:
                try:
                    # Get the app and attempt to shutdown any active listeners
                    app = self._apps[agent_id]
                    # Disconnect all listeners and callbacks
                    if hasattr(app, "client") and app.client:
                        logger.info(f"Disconnecting client for agent {agent_id}")
                        if hasattr(app.client, "close"):
                            # Try to close the client's connection
                            app.client.close()
                except Exception as e:
                    logger.error(f"Error shutting down app for agent {agent_id}: {e}")
                    # Continue with handler close even if app shutdown fails

            # Now close the socket handler
            try:
                logger.info(f"Closing socket handler for agent {agent_id}")
                try:
                    # Try to stop the handler's background processor
                    if hasattr(handler, "processor") and handler.processor:
                        if hasattr(handler.processor, "stop"):
                            handler.processor.stop()
                except Exception as e:
                    logger.error(f"Error stopping processor: {e}")

                # Close the main handler
                handler.close()

                # Force close any remaining connections
                if hasattr(handler, "client") and handler.client:
                    logger.info(f"Force closing handler client for agent {agent_id}")
                    if hasattr(handler.client, "close"):
                        handler.client.close()

                # If there's a WebSocket connection still open, try to close it
                if hasattr(handler, "web_socket_client") and handler.web_socket_client:
                    logger.info(f"Force closing WebSocket for agent {agent_id}")
                    if hasattr(handler.web_socket_client, "close"):
                        handler.web_socket_client.close()
                    # Even more aggressive - if there's a socket object
                    if (
                        hasattr(handler.web_socket_client, "sock")
                        and handler.web_socket_client.sock
                    ):
                        try:
                            logger.info(f"Force closing raw socket for agent {agent_id}")
                            handler.web_socket_client.sock.close()
                        except Exception as e:
                            logger.error(f"Error closing raw socket: {e}")

                logger.info(f"Socket handler closed for agent {agent_id}")
            except Exception as e:
                logger.error(f"Error closing socket handler: {e}")
                logger.error(f"Socket close error details: {traceback.format_exc()}")

            # Try more aggressive thread termination approach
            self._try_aggressive_thread_termination(agent_id, handler)

            # Remove from dictionaries
            if agent_id in self._socket_mode_handlers:
                del self._socket_mode_handlers[agent_id]
            if agent_id in self._apps:
                del self._apps[agent_id]

            # Make sure we're blacklisted
            if agent_id not in self._blacklisted_agents:
                self._blacklisted_agents.add(agent_id)
                logger.info(f"Added agent {agent_id} to blacklist")

            # Verify the socket is actually stopped
            if self.is_running(agent_id):
                logger.error(
                    f"Socket for agent {agent_id} is still reported as running after stop attempt"
                )
                return False

            # Add an extra check for the socket worker to verify any lingering connections
            logger.info(f"Socket Mode stopped successfully for agent {agent_id}")

            # Reset any in-memory connection caches that Slack SDK might be maintaining
            try:
                # Slack SDK might cache connections somewhere globally - try to clear them
                import importlib

                try:
                    slack_sdk = importlib.import_module("slack_sdk")
                    if hasattr(slack_sdk, "WebClient") and hasattr(slack_sdk.WebClient, "_reset"):
                        slack_sdk.WebClient._reset()
                        logger.info("Reset Slack SDK WebClient")
                except Exception:
                    pass

                try:
                    socket_mode = importlib.import_module("slack_bolt.adapter.socket_mode")
                    # Try to get any cached handlers and close them
                    if hasattr(socket_mode, "_connections"):
                        socket_mode._connections = {}
                except Exception:
                    pass
            except Exception as e:
                logger.error(f"Error resetting SDK connections: {e}")

            return True
        except Exception as e:
            logger.error(f"Error stopping Socket Mode for agent {agent_id}: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False

    def _try_aggressive_thread_termination(self, agent_id: int, handler: Any) -> None:
        """Attempt to aggressively terminate any threads or tasks associated with the socket handler"""
        try:
            # See if the socket handler has a thread running and try to terminate it
            if hasattr(handler, "thread") and handler.thread:
                thread = handler.thread
                logger.info(f"Found SocketModeHandler thread: {thread}")
                if hasattr(thread, "is_alive") and thread.is_alive():
                    logger.info("Socket thread is still alive, trying aggressive termination")
                    # Try different thread termination methods
                    if hasattr(thread, "_stop"):
                        thread._stop()
                    if hasattr(thread, "_terminate"):
                        thread._terminate()
                    if hasattr(thread, "cancel"):
                        thread.cancel()
                    if hasattr(thread, "kill"):
                        thread.kill()

            # If there's a running task, try to cancel it
            if hasattr(handler, "task") and handler.task:
                logger.info("Cancelling socket handler task")
                if hasattr(handler.task, "cancel"):
                    handler.task.cancel()

            # If the handler has a loop running, try to stop it
            if hasattr(handler, "loop") and handler.loop:
                logger.info("Stopping socket handler event loop")
                if hasattr(handler.loop, "stop"):
                    handler.loop.stop()
                if hasattr(handler.loop, "close"):
                    handler.loop.close()

            # Look for any WebSocketApp connections
            if hasattr(handler, "wss_client") and handler.wss_client:
                logger.info("Found WebSocketApp, forcefully closing")
                if hasattr(handler.wss_client, "close"):
                    handler.wss_client.close()
                if hasattr(handler.wss_client, "sock") and handler.wss_client.sock:
                    if hasattr(handler.wss_client.sock, "shutdown"):
                        handler.wss_client.sock.shutdown()
                    if hasattr(handler.wss_client.sock, "close"):
                        handler.wss_client.sock.close()

        except Exception as e:
            logger.error(f"Error with aggressive thread termination for agent {agent_id}: {e}")

    def is_running(self, agent_id: int) -> bool:
        """Check if Socket Mode is running for a specific agent"""
        return agent_id in self._socket_mode_handlers

    def stop_all(self):
        """Stop all Socket Mode handlers"""
        logger.info("Stopping all Socket Mode handlers")

        agent_ids = list(self._socket_mode_handlers.keys())
        for agent_id in agent_ids:
            self.stop_socket_mode(agent_id)

    def _forcibly_disconnect_slack_sessions(self, agent_id: int) -> None:
        """Forcibly disconnect any Slack sessions for this agent by invalidating app connections.

        This is the most effective way to ensure Slack stops sending events to this agent.
        """
        logger.info(f"Forcibly disconnecting Slack sessions for agent {agent_id}")

        try:
            # Get agent tokens from secure store
            from ...api.secure_token_store import get_token_store

            token_store = get_token_store()

            # If we have an app token, use it to revoke connections
            app_token = token_store.get_token(agent_id, "app_token")
            if app_token:
                logger.info(f"Using app token to forcibly disconnect sessions for agent {agent_id}")
                try:
                    # Even though we can't directly revoke app tokens, we can try to disconnect sessions
                    # by making an auth test call with an invalid client
                    from slack_sdk import WebClient
                    from slack_sdk.errors import SlackApiError

                    # Create dummy WebClient with the app token (will fail but helps disconnect)
                    client = WebClient(token=app_token)
                    try:
                        # This will fail but trigger a session reset on Slack side
                        client.auth_test()
                    except SlackApiError:
                        pass

                    # Try to directly disconnect client
                    if hasattr(client, "close"):
                        client.close()
                except Exception as e:
                    logger.error(f"Error disconnecting app token session: {e}")

            # If we have a bot token, also use it for more thorough disconnection
            bot_token = token_store.get_token(agent_id, "bot_token")
            if bot_token:
                logger.info(f"Using bot token to forcibly disconnect sessions for agent {agent_id}")
                try:
                    from slack_sdk import WebClient
                    from slack_sdk.errors import SlackApiError

                    # Create client and try to disconnect gracefully
                    client = WebClient(token=bot_token)

                    # Post a system message to help debug (comment out in production)
                    try:
                        # Find the primary channel id from the agent model
                        db = next(get_db())
                        agent = (
                            db.query(SlackAgentModel).filter(SlackAgentModel.id == agent_id).first()
                        )
                        if agent and agent.slack_channel_id:
                            channel_id = agent.slack_channel_id
                            # Send logout message to channel
                            client.chat_postMessage(
                                channel=channel_id,
                                text=f"⚠️ Socket Mode disabled for agent {agent_id}. Disconnecting active sessions...",
                            )
                    except Exception as notify_err:
                        logger.error(f"Error notifying Slack channel: {notify_err}")

                    # Close client to disconnect
                    if hasattr(client, "close"):
                        client.close()
                except Exception as e:
                    logger.error(f"Error disconnecting bot token session: {e}")

            # Last resort - force terminate socket handlers directly by accessing internals
            if agent_id in self._socket_mode_handlers:
                handler = self._socket_mode_handlers[agent_id]
                # Access websocket app directly if possible
                if hasattr(handler, "app") and handler.app:
                    app = handler.app
                    # Try to stop all socket connections by accessing socket_mode listeners directly
                    if hasattr(app, "listeners") and isinstance(app.listeners, dict):
                        for event_type in list(app.listeners.keys()):
                            try:
                                # Remove all listeners to prevent event handling
                                app.listeners[event_type] = []
                            except Exception:
                                pass

        except Exception as e:
            logger.error(f"Error forcibly disconnecting sessions: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")


# Singleton instance accessor
def get_socket_mode_client() -> SocketModeClient:
    """Get the singleton SocketModeClient instance"""
    return SocketModeClient()

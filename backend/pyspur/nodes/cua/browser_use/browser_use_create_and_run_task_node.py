import time
from typing import Any, Dict, List, Optional

import requests
from pydantic import BaseModel, Field  # type: ignore

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class BrowserUseCreateAndRunTaskNodeInput(BaseNodeInput):
    """Input for the BrowserUseCreateAndRunTask node."""

    instructions: str = Field(
        ..., description="The instructions to run in the browser automation task"
    )


class BrowserUseTaskStep(BaseModel):
    """Represents a step in the browser automation task."""

    action: str = Field(..., description="Action performed in this step")
    status: str = Field(..., description="Status of this step")
    details: Optional[Dict[str, Any]] = Field(
        None, description="Additional details about this step"
    )
    screenshot: Optional[str] = Field(
        None, description="URL to screenshot for this step, if available"
    )


class BrowserUseCreateAndRunTaskNodeOutput(BaseNodeOutput):
    """Output from the BrowserUseCreateAndRunTask node."""

    task_id: str = Field(..., description="ID of the executed task")
    status: str = Field(..., description="Final status of the task (finished, failed, stopped)")
    steps: List[BrowserUseTaskStep] = Field(
        ..., description="Steps performed during task execution"
    )
    output: Optional[Dict[str, Any]] = Field(None, description="Final output data from the task")


class BrowserUseCreateAndRunTaskNodeConfig(BaseNodeConfig):
    """Configuration for the BrowserUseCreateAndRunTask node."""

    poll_interval: int = Field(2, description="Interval in seconds between polling for task status")
    timeout: int = Field(300, description="Maximum time in seconds to wait for task completion")


class BrowserUseCreateAndRunTaskNode(BaseNode):
    """Node for creating and running browser automation tasks via the browser-use.com API."""

    name = "browser_use_create_and_run_task_node"
    display_name = "BrowserUseCreateAndRunTask"
    logo = "/images/browser_use.png"
    category = "Browser Automation"

    config_model = BrowserUseCreateAndRunTaskNodeConfig
    input_model = BrowserUseCreateAndRunTaskNodeInput
    output_model = BrowserUseCreateAndRunTaskNodeOutput

    def setup(self) -> None:
        """Set up the node with API configuration."""
        super().setup()
        self.api_key = self._get_api_key()
        self.base_url = "https://api.browser-use.com/api/v1"
        self.headers = {"Authorization": f"Bearer {self.api_key}"}

    def _get_api_key(self) -> str:
        """Get the API key from environment variables."""
        import os

        api_key = os.getenv("BROWSER_USE_API_KEY")
        if not api_key:
            raise ValueError("BROWSER_USE_API_KEY not found in environment variables")
        return api_key

    def _create_task(self, instructions: str) -> str:
        """Create a new browser automation task."""
        response = requests.post(
            f"{self.base_url}/run-task", headers=self.headers, json={"task": instructions}
        )
        if response.status_code != 200:
            raise ValueError(f"Failed to create task: {response.text}")
        return response.json()["id"]

    def _get_task_details(self, task_id: str) -> Dict[str, Any]:
        """Get full task details including output."""
        response = requests.get(f"{self.base_url}/task/{task_id}", headers=self.headers)
        if response.status_code != 200:
            raise ValueError(f"Failed to get task details: {response.text}")
        return response.json()

    def _wait_for_completion(
        self, task_id: str, poll_interval: int = 2, timeout: int = 300
    ) -> Dict[str, Any]:
        """Poll task status until completion or timeout."""
        start_time = time.time()
        unique_steps = []

        while True:
            details = self._get_task_details(task_id)
            new_steps = details.get("steps", [])

            # Track progress with new steps
            if new_steps != unique_steps:
                unique_steps = new_steps

            status = details.get("status")

            # Check for completion or timeout
            if status in ["finished", "failed", "stopped"]:
                return details

            if time.time() - start_time > timeout:
                raise TimeoutError(f"Task {task_id} timed out after {timeout} seconds")

            time.sleep(poll_interval)

    async def run(
        self, input: BrowserUseCreateAndRunTaskNodeInput
    ) -> BrowserUseCreateAndRunTaskNodeOutput:
        """Run a browser automation task and return the results."""
        try:
            # Create the task
            task_id = self._create_task(input.instructions)

            # Wait for completion
            task_details = self._wait_for_completion(
                task_id, poll_interval=self.config.poll_interval, timeout=self.config.timeout
            )

            # Convert the task steps to our model
            steps = []
            for step_data in task_details.get("steps", []):
                step = BrowserUseTaskStep(
                    action=step_data.get("action", "unknown"),
                    status=step_data.get("status", "unknown"),
                    details=step_data.get("details"),
                    screenshot=step_data.get("screenshot"),
                )
                steps.append(step)

            # Return the output
            return BrowserUseCreateAndRunTaskNodeOutput(
                task_id=task_id,
                status=task_details.get("status", "unknown"),
                steps=steps,
                output=task_details.get("output"),
            )

        except Exception as e:
            raise Exception(f"Browser automation task failed: {str(e)}")

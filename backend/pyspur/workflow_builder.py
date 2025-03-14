import json
from typing import Any, Dict, List, Optional, Tuple, Union

from .schemas.workflow_schemas import (
    SpurType,
    WorkflowDefinitionSchema,
    WorkflowLinkSchema,
    WorkflowNodeCoordinatesSchema,
    WorkflowNodeDimensionsSchema,
    WorkflowNodeSchema,
)


class WorkflowBuilder:
    """Builder class for creating workflows programmatically.

    This class allows users to define workflows in code, providing a cleaner
    alternative to manually defining the JSON structure.

    Example:
        ```python
        # Create a workflow builder
        builder = WorkflowBuilder("My Workflow", "This is a workflow created with code")

        # Add nodes
        input_node = builder.add_node(
            id="input_node",
            node_type="InputNode",
            config={"output_schema": {"question": "string"}}
        )

        llm_node = builder.add_node(
            id="llm_node",
            node_type="SingleLLMCallNode",
            config={
                "llm_info": {
                    "model": "openai/gpt-4o",
                    "temperature": 0.7,
                },
                "system_message": "You are a helpful assistant."
            }
        )

        output_node = builder.add_node(
            id="output_node",
            node_type="OutputNode",
            config={
                "output_schema": {"answer": "string"},
                "output_map": {"answer": "llm_node.response"}
            }
        )

        # Connect nodes
        builder.add_link(input_node, llm_node)
        builder.add_link(llm_node, output_node)

        # Get the workflow definition
        workflow_def = builder.build()
        ```

    """

    def __init__(self, name: str, description: str = ""):
        """Initialize a workflow builder.

        Args:
            name: The name of the workflow
            description: Optional description for the workflow

        """
        self.name = name
        self.description = description
        self.nodes: List[WorkflowNodeSchema] = []
        self.links: List[WorkflowLinkSchema] = []
        self.test_inputs: List[Dict[str, Any]] = []
        self.spur_type: SpurType = SpurType.WORKFLOW
        self._node_counter: Dict[str, int] = {}  # Track counts for auto-generated IDs

        # Let's add some default positioning logic to make visualizing nicer
        self._next_x = 100
        self._next_y = 100
        self._horizontal_spacing = 250  # Default horizontal spacing between nodes
        self._vertical_spacing = 150  # Default vertical spacing between rows
        self._max_x_per_row: Dict[int, int] = {0: self._next_x}  # Track max x per row
        self._current_row = 0

    def add_node(
        self,
        node_type: str,
        config: Dict[str, Any],
        id: Optional[str] = None,
        title: str = "",
        parent_id: Optional[str] = None,
        coordinates: Optional[Tuple[float, float]] = None,
        dimensions: Optional[Tuple[float, float]] = None,
        subworkflow: Optional[WorkflowDefinitionSchema] = None,
        row: Optional[int] = None,
    ) -> str:
        """Add a node to the workflow.

        Args:
            node_type: The type of node to add (e.g., "InputNode", "SingleLLMCallNode")
            config: Configuration for the node
            id: Optional node ID. If not provided, one will be generated
            title: Optional display title for the node
            parent_id: Optional parent node ID for hierarchical workflows
            coordinates: Optional tuple of (x, y) coordinates for UI positioning
            dimensions: Optional tuple of (width, height) for UI sizing
            subworkflow: Optional sub-workflow definition for composite nodes
            row: Optional row number for positioning (used for auto-layout)

        Returns:
            The ID of the added node

        """
        # If no ID is provided, generate one based on the node type
        if id is None:
            id = self._generate_id(node_type)

        # If no title is provided, use the ID
        if not title:
            title = id

        # Handle coordinates for UI layout
        node_coordinates = None
        if coordinates:
            node_coordinates = WorkflowNodeCoordinatesSchema(x=coordinates[0], y=coordinates[1])
        else:
            # Auto-position the node
            if row is not None:
                self._current_row = row

            # Calculate coordinates based on current row and position
            x = self._max_x_per_row.get(self._current_row, self._next_x)
            y = self._current_row * self._vertical_spacing + 100

            node_coordinates = WorkflowNodeCoordinatesSchema(x=x, y=y)

            # Update the max x for this row
            self._max_x_per_row[self._current_row] = x + self._horizontal_spacing

        # Handle dimensions for UI sizing
        node_dimensions = None
        if dimensions:
            node_dimensions = WorkflowNodeDimensionsSchema(
                width=dimensions[0], height=dimensions[1]
            )

        # Create the node schema
        node = WorkflowNodeSchema(
            id=id,
            title=title,
            parent_id=parent_id,
            node_type=node_type,
            config=config,
            coordinates=node_coordinates,
            dimensions=node_dimensions,
            subworkflow=subworkflow,
        )

        # Add the node to the workflow
        self.nodes.append(node)

        return id

    def add_link(
        self,
        source_id: str,
        target_id: str,
        source_handle: Optional[str] = None,
        target_handle: Optional[str] = None,
    ) -> None:
        """Add a link between two nodes.

        Args:
            source_id: The ID of the source node
            target_id: The ID of the target node
            source_handle: Optional source handle for routers and complex nodes
            target_handle: Optional target handle

        """
        link = WorkflowLinkSchema(
            source_id=source_id,
            target_id=target_id,
            source_handle=source_handle,
            target_handle=target_handle,
        )
        self.links.append(link)

    def add_test_input(self, input_data: Dict[str, Any]) -> None:
        """Add test input data for the workflow.

        Args:
            input_data: A dictionary containing test input data

        """
        self.test_inputs.append(input_data)

    def set_spur_type(self, spur_type: Union[SpurType, str]) -> None:
        """Set the type of the workflow.

        Args:
            spur_type: The workflow type (workflow, chatbot, or agent)

        """
        self.spur_type = SpurType(spur_type)

    def build(self) -> WorkflowDefinitionSchema:
        """Build and return the workflow definition schema.

        Returns:
            A WorkflowDefinitionSchema instance representing the complete workflow

        """
        workflow = WorkflowDefinitionSchema(
            nodes=self.nodes,
            links=self.links,
            test_inputs=self.test_inputs,
            spur_type=self.spur_type,
        )
        return workflow

    def to_dict(self) -> Dict[str, Any]:
        """Convert the workflow to a dictionary.

        Returns:
            A dictionary representation of the workflow

        """
        workflow = self.build()
        return workflow.model_dump()

    def to_json(self, indent: int = 2) -> str:
        """Convert the workflow to a JSON string.

        Args:
            indent: Number of spaces for indentation in JSON output

        Returns:
            A JSON string representation of the workflow

        """
        workflow = self.build()
        return json.dumps(workflow.model_dump(), indent=indent)

    @classmethod
    def from_workflow_definition(
        cls, workflow_def: WorkflowDefinitionSchema, name: str = "", description: str = ""
    ) -> "WorkflowBuilder":
        """Create a WorkflowBuilder from an existing WorkflowDefinitionSchema.

        Args:
            workflow_def: The workflow definition to convert
            name: Optional name for the workflow (if not provided, will use "Imported Workflow")
            description: Optional description for the workflow

        Returns:
            A WorkflowBuilder instance with the nodes and links from the workflow definition

        """
        builder = cls(name or "Imported Workflow", description)

        # Copy nodes
        builder.nodes = workflow_def.nodes

        # Copy links
        builder.links = workflow_def.links

        # Copy test inputs
        builder.test_inputs = workflow_def.test_inputs

        # Copy spur type
        builder.spur_type = workflow_def.spur_type

        return builder

    def _generate_id(self, node_type: str) -> str:
        """Generate a unique ID for a node based on its type.

        Args:
            node_type: The type of node

        Returns:
            A unique ID for the node

        """
        # Remove "Node" suffix if present
        base_name = node_type
        if base_name.endswith("Node"):
            base_name = base_name[:-4]

        # Get the counter for this node type
        counter = self._node_counter.get(base_name, 0) + 1
        self._node_counter[base_name] = counter

        # Generate the ID
        return f"{base_name}_{counter}"

import re
from typing import Any, Dict, Optional

from .schemas.workflow_schemas import WorkflowDefinitionSchema
from .workflow_builder import WorkflowBuilder


class WorkflowCodeHandler:
    """Utility class for handling workflow-as-code functionality.

    This class provides methods to:
    1. Generate Python code from a workflow definition
    2. Parse Python code to create a workflow definition
    3. Reconcile UI-driven changes with code-driven workflows
    """

    @classmethod
    def generate_code(
        cls,
        workflow_def: WorkflowDefinitionSchema,
        workflow_name: str = "My Workflow",
        workflow_description: str = "",
        preserve_coordinates: bool = True,
        preserve_dimensions: bool = True,
    ) -> str:
        """Generate Python code from a workflow definition.

        Args:
            workflow_def: The workflow definition to convert to code
            workflow_name: The name of the workflow
            workflow_description: Optional description for the workflow
            preserve_coordinates: Whether to include node coordinates in the code
            preserve_dimensions: Whether to include node dimensions in the code

        Returns:
            Python code representation of the workflow

        """
        code = [
            "from pyspur.workflow_builder import WorkflowBuilder",
            "",
            "# Create a workflow builder",
            f'builder = WorkflowBuilder("{workflow_name}", "{workflow_description}")',
            "",
        ]

        code.append("# Set the workflow type")
        code.append(f'builder.set_spur_type("{workflow_def.spur_type}")')
        code.append("")

        # Generate node creation code
        code.append("# Add nodes")
        # Map node IDs to variable names
        node_vars: Dict[str, str] = {}

        for node in workflow_def.nodes:
            # Create a valid Python variable name from the node ID
            var_name = cls._create_variable_name(node.id)
            node_vars[node.id] = var_name

            # Format the config dictionary as Python code
            config_str = cls._format_dict(node.config)

            # Build the add_node arguments
            args = [
                f'node_type="{node.node_type}"',
                f"config={config_str}",
                f'id="{node.id}"',
            ]

            if node.title and node.title != node.id:
                args.append(f'title="{node.title}"')

            if node.parent_id:
                args.append(f'parent_id="{node.parent_id}"')

            if preserve_coordinates and node.coordinates:
                args.append(f"coordinates=({node.coordinates.x}, {node.coordinates.y})")

            if preserve_dimensions and node.dimensions:
                args.append(f"dimensions=({node.dimensions.width}, {node.dimensions.height})")

            if node.subworkflow:
                # This would need recursive handling for subworkflows
                args.append("# subworkflow is not included in this code generation")

            # Join all arguments with newlines and proper indentation for readability
            formatted_args = ",\n    ".join(args)

            # Add the node creation code
            code.append(f"{var_name} = builder.add_node(")
            code.append(f"    {formatted_args}")
            code.append(")")
            code.append("")

        # Generate link creation code
        if workflow_def.links:
            code.append("# Add links between nodes")
            for link in workflow_def.links:
                source_var = node_vars.get(link.source_id, f'"{link.source_id}"')
                target_var = node_vars.get(link.target_id, f'"{link.target_id}"')

                if link.source_handle or link.target_handle:
                    args = [
                        f"source_id={source_var}",
                        f"target_id={target_var}",
                    ]

                    if link.source_handle:
                        args.append(f'source_handle="{link.source_handle}"')

                    if link.target_handle:
                        args.append(f'target_handle="{link.target_handle}"')

                    # Join all arguments with commas
                    formatted_args = ", ".join(args)

                    code.append(f"builder.add_link({formatted_args})")
                else:
                    code.append(f"builder.add_link({source_var}, {target_var})")

            code.append("")

        # Generate test input code
        if workflow_def.test_inputs:
            code.append("# Add test inputs")
            for _i, test_input in enumerate(workflow_def.test_inputs):
                input_str = cls._format_dict(test_input)
                code.append(f"builder.add_test_input({input_str})")
            code.append("")

        # Build the workflow
        code.append("# Build the workflow definition")
        code.append("workflow_def = builder.build()")

        return "\n".join(code)

    @classmethod
    def parse_code(
        cls, code: str, existing_workflow: Optional[WorkflowDefinitionSchema] = None
    ) -> WorkflowDefinitionSchema:
        """Parse Python code and convert it to a workflow definition.

        The code is expected to use the WorkflowBuilder API to define a workflow.

        Args:
            code: Python code defining a workflow
            existing_workflow: Optional existing workflow to preserve UI metadata from

        Returns:
            A WorkflowDefinitionSchema instance

        Raises:
            ValueError: If the code cannot be parsed or does not define a workflow

        """
        try:
            # Create a local namespace to execute the code
            local_vars: Dict[str, Any] = {}

            # Execute the code in a restricted environment
            exec(code, {"WorkflowBuilder": WorkflowBuilder}, local_vars)

            # Look for a workflow_def variable that is a WorkflowDefinitionSchema
            workflow_def = None
            for _var_name, var_value in local_vars.items():
                if isinstance(var_value, WorkflowDefinitionSchema):
                    workflow_def = var_value
                    break

            if not workflow_def:
                # If we didn't find a WorkflowDefinitionSchema directly, look for a builder
                builder = None
                for _var_name, var_value in local_vars.items():
                    if isinstance(var_value, WorkflowBuilder):
                        builder = var_value
                        break

                if builder:
                    workflow_def = builder.build()

            if not workflow_def:
                raise ValueError("No workflow definition found in the code")

            # If we have an existing workflow, preserve UI metadata
            if existing_workflow:
                workflow_def = cls._reconcile_workflow_with_existing(
                    workflow_def, existing_workflow
                )

            return workflow_def

        except Exception as e:
            raise ValueError(f"Failed to parse workflow code: {str(e)}") from e

    @classmethod
    def _reconcile_workflow_with_existing(
        cls, new_workflow: WorkflowDefinitionSchema, existing_workflow: WorkflowDefinitionSchema
    ) -> WorkflowDefinitionSchema:
        """Reconcile a new workflow with an existing one, preserving UI metadata.

        Args:
            new_workflow: The new workflow generated from code
            existing_workflow: The existing workflow with UI metadata

        Returns:
            A workflow definition with code structure and UI metadata

        """
        # Create a mapping of node IDs to nodes in the existing workflow
        existing_nodes = {node.id: node for node in existing_workflow.nodes}

        # For each node in the new workflow, copy UI metadata from the existing workflow
        for node in new_workflow.nodes:
            if node.id in existing_nodes:
                existing_node = existing_nodes[node.id]

                # Preserve coordinates if they exist
                if existing_node.coordinates and not node.coordinates:
                    node.coordinates = existing_node.coordinates

                # Preserve dimensions if they exist
                if existing_node.dimensions and not node.dimensions:
                    node.dimensions = existing_node.dimensions

        return new_workflow

    @classmethod
    def _format_dict(cls, d: Dict[str, Any], indent: int = 0) -> str:
        """Format a dictionary as a Python code string.

        Args:
            d: The dictionary to format
            indent: The current indentation level

        Returns:
            A formatted string representing the dictionary as Python code

        """
        if not d:
            return "{}"

        # Handle special cases for formatting
        lines = ["{"]
        indent_str = "    " * (indent + 1)

        for key, value in d.items():
            formatted_value = cls._format_value(value, indent + 1)
            lines.append(f'{indent_str}"{key}": {formatted_value},')

        lines.append("    " * indent + "}")

        return "\n".join(lines)

    @classmethod
    def _format_value(cls, value: Any, indent: int = 0) -> str:
        """Format a value as a Python code string.

        Args:
            value: The value to format
            indent: The current indentation level

        Returns:
            A formatted string representing the value as Python code

        """
        if value is None:
            return "None"
        elif isinstance(value, (int, float, bool)):
            return str(value)
        elif isinstance(value, str):
            # Escape quotes and special characters
            escaped = value.replace('"', '\\"').replace("\n", "\\n")
            return f'"{escaped}"'
        elif isinstance(value, (list, tuple)):
            if not value:
                return "[]"

            items = [cls._format_value(item, indent) for item in value]  # type: ignore
            if len(items) <= 3 and all(len(item) < 40 for item in items):
                # Format as a single line if it's short
                return f"[{', '.join(items)}]"
            else:
                # Format as multiple lines
                indent_str = "    " * indent
                next_indent = "    " * (indent + 1)
                items_str = f",\n{next_indent}".join(items)
                return f"[\n{next_indent}{items_str}\n{indent_str}]"
        elif isinstance(value, dict):
            return cls._format_dict(value, indent)  # type: ignore
        else:
            # For other types, use repr
            return repr(value)

    @classmethod
    def _create_variable_name(cls, node_id: str) -> str:
        """Create a valid Python variable name from a node ID.

        Args:
            node_id: The node ID to convert

        Returns:
            A valid Python variable name

        """
        # Replace non-alphanumeric characters with underscores
        var_name = re.sub(r"[^a-zA-Z0-9_]", "_", node_id)

        # Ensure it starts with a letter or underscore
        if var_name and not var_name[0].isalpha() and var_name[0] != "_":
            var_name = "node_" + var_name

        return var_name

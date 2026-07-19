import ast
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

    # ------------------------------------------------------------------
    # Safe AST-based interpreter for workflow-builder code
    # ------------------------------------------------------------------
    #
    # SECURITY: parse_code() must never execute untrusted Python via exec()
    # or eval(). Older versions of this file passed the user-supplied source
    # directly to exec(), which is remote code execution: the WorkflowBuilder
    # namespace restriction is not a sandbox (Python builtins remain
    # reachable through __builtins__, dunder chains, etc.), and the HTTP
    # endpoints in api/workflow_code_convert.py forward request.code from
    # unauthenticated callers straight into this function (CWE-95).
    #
    # Instead, we parse the source into an AST and walk it, only honoring a
    # small allow-list of constructs that the code generator above can emit:
    #
    #   * `from pyspur.workflow_builder import WorkflowBuilder`  (ignored)
    #   * `import pyspur.workflow_builder ...`                   (ignored)
    #   * `builder = WorkflowBuilder(<literal>, <literal>)`
    #   * `<var> = builder.add_node(<literal kwargs>)`
    #   * `builder.set_spur_type(<literal>)`
    #   * `builder.add_link(<literal-or-node-var>, ...)`
    #   * `builder.add_test_input(<literal dict>)`
    #   * `workflow_def = builder.build()`
    #
    # Any other statement, expression, attribute access, call, name
    # reference, or non-literal argument raises ValueError. There is no
    # execution of arbitrary Python and no attribute traversal that could
    # reach into the interpreter.
    # ------------------------------------------------------------------

    _ALLOWED_BUILDER_METHODS = {
        "add_node",
        "add_link",
        "add_test_input",
        "set_spur_type",
        "build",
    }

    @classmethod
    def _literal(cls, node: ast.AST, node_vars: Dict[str, str]) -> Any:
        """Evaluate an AST node as a literal or a known node-id variable.

        Only Python literals (via ast.literal_eval) and references to
        previously-bound node-id variables are allowed. Any other
        construct raises ValueError.
        """
        # Named reference to a node-id previously returned by add_node().
        if isinstance(node, ast.Name):
            if node.id in node_vars:
                return node_vars[node.id]
            raise ValueError(f"Reference to unknown name '{node.id}' is not allowed")

        # Tuples/lists/dicts of literals are handled by literal_eval.
        try:
            return ast.literal_eval(node)
        except (ValueError, SyntaxError) as e:
            raise ValueError(
                "Only literal values or node-id variables are permitted as arguments"
            ) from e

    @classmethod
    def _safe_interpret(cls, code: str) -> WorkflowBuilder:
        """Parse workflow code with AST only — never exec/eval user code."""
        try:
            tree = ast.parse(code, mode="exec")
        except SyntaxError as e:
            raise ValueError(f"Invalid Python syntax: {e}") from e

        builder: Optional[WorkflowBuilder] = None
        node_vars: Dict[str, str] = {}
        workflow_def_local: Optional[WorkflowDefinitionSchema] = None
        builder_name: Optional[str] = None

        for stmt in tree.body:
            # Allow (but ignore) imports of the workflow_builder module.
            if isinstance(stmt, (ast.Import, ast.ImportFrom)):
                module = getattr(stmt, "module", None) or ""
                names = [alias.name for alias in stmt.names]
                if isinstance(stmt, ast.ImportFrom):
                    if module != "pyspur.workflow_builder" or names != ["WorkflowBuilder"]:
                        raise ValueError(
                            "Only 'from pyspur.workflow_builder import WorkflowBuilder' "
                            "is allowed"
                        )
                else:
                    if not all(n.startswith("pyspur.workflow_builder") for n in names):
                        raise ValueError("Only imports of pyspur.workflow_builder are allowed")
                continue

            # Bare expression statements (e.g. docstrings, method calls without
            # assignment) — only allow builder.<method>(...) calls.
            if isinstance(stmt, ast.Expr):
                value = stmt.value
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    # Module/section docstring or comment-like string — ignore.
                    continue
                if isinstance(value, ast.Call):
                    cls._dispatch_call(value, builder, builder_name, node_vars)
                    continue
                raise ValueError("Only builder method calls are allowed as statements")

            # Assignments: builder = WorkflowBuilder(...), var = builder.add_node(...),
            # workflow_def = builder.build()
            if isinstance(stmt, ast.Assign):
                if len(stmt.targets) != 1 or not isinstance(stmt.targets[0], ast.Name):
                    raise ValueError("Only simple 'name = <call>' assignments are allowed")
                target_name = stmt.targets[0].id
                value = stmt.value

                if not isinstance(value, ast.Call):
                    raise ValueError("Assignments must be of a call expression")

                # WorkflowBuilder(...)
                if (
                    isinstance(value.func, ast.Name)
                    and value.func.id == "WorkflowBuilder"
                ):
                    if builder is not None:
                        raise ValueError("WorkflowBuilder may only be instantiated once")
                    args = [cls._literal(a, node_vars) for a in value.args]
                    kwargs = {kw.arg: cls._literal(kw.value, node_vars) for kw in value.keywords}
                    builder = WorkflowBuilder(*args, **kwargs)
                    builder_name = target_name
                    continue

                # builder.<method>(...)
                result = cls._dispatch_call(value, builder, builder_name, node_vars)
                if isinstance(result, WorkflowDefinitionSchema):
                    workflow_def_local = result
                elif isinstance(result, str):
                    # add_node returns the node id — remember it under the
                    # assigned variable name so later links can reference it.
                    node_vars[target_name] = result
                continue

            raise ValueError(
                f"Disallowed statement of type {type(stmt).__name__} in workflow code"
            )

        if builder is None:
            raise ValueError("Workflow code must instantiate a WorkflowBuilder")

        # Stash a possible pre-built definition on the builder for the caller.
        if workflow_def_local is not None:
            builder._parsed_workflow_def = workflow_def_local  # type: ignore[attr-defined]
        return builder

    @classmethod
    def _dispatch_call(
        cls,
        call: ast.Call,
        builder: Optional[WorkflowBuilder],
        builder_name: Optional[str],
        node_vars: Dict[str, str],
    ) -> Any:
        """Execute a whitelisted builder method call from AST."""
        if not (
            isinstance(call.func, ast.Attribute)
            and isinstance(call.func.value, ast.Name)
            and builder_name is not None
            and call.func.value.id == builder_name
        ):
            raise ValueError("Only method calls on the WorkflowBuilder instance are allowed")

        if builder is None:
            raise ValueError("Builder used before instantiation")

        method_name = call.func.attr
        if method_name not in cls._ALLOWED_BUILDER_METHODS:
            raise ValueError(f"Method '{method_name}' is not allowed on WorkflowBuilder")

        args = [cls._literal(a, node_vars) for a in call.args]
        kwargs = {kw.arg: cls._literal(kw.value, node_vars) for kw in call.keywords}
        method = getattr(builder, method_name)
        return method(*args, **kwargs)

    @classmethod
    def parse_code(
        cls, code: str, existing_workflow: Optional[WorkflowDefinitionSchema] = None
    ) -> WorkflowDefinitionSchema:
        """Parse Python code and convert it to a workflow definition.

        The code is expected to use the WorkflowBuilder API to define a workflow.
        It is parsed via a restricted AST interpreter — no user-supplied code
        is ever executed via exec() or eval().

        Args:
            code: Python code defining a workflow
            existing_workflow: Optional existing workflow to preserve UI metadata from

        Returns:
            A WorkflowDefinitionSchema instance

        Raises:
            ValueError: If the code cannot be parsed or does not define a workflow

        """
        try:
            builder = cls._safe_interpret(code)

            workflow_def = getattr(builder, "_parsed_workflow_def", None)
            if workflow_def is None:
                workflow_def = builder.build()

            if not workflow_def:
                raise ValueError("No workflow definition found in the code")

            # If we have an existing workflow, preserve UI metadata
            if existing_workflow:
                workflow_def = cls._reconcile_workflow_with_existing(
                    workflow_def, existing_workflow
                )

            return workflow_def

        except ValueError:
            raise
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

from typing import Any, Dict, List

from pydantic import BaseModel, Field

from ....execution.workflow_executor import WorkflowExecutor
from ....nodes.base import BaseNodeInput, BaseNodeOutput
from ....schemas.workflow_schemas import (
    WorkflowDefinitionSchema,
    WorkflowLinkSchema,
    WorkflowNodeSchema,
)
from ...subworkflow.base_subworkflow_node import (
    BaseSubworkflowNode,
    BaseSubworkflowNodeConfig,
)
from .._utils import LLMModels, ModelInfo


class BranchSolveMergeNodeConfig(BaseSubworkflowNodeConfig):
    llm_info: ModelInfo = Field(
        default_factory=lambda: ModelInfo(
            model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7
        ),
        description="The default LLM model to use",
    )
    branch_system_message: str = Field(
        default=(
            "Please decompose the following task into logical subtasks "
            "that make solving the overall task easier."
        ),
        description="The prompt for the branch LLM",
    )
    solve_system_message: str = Field(
        default="Please provide a detailed solution for the following subtask:",
        description="The prompt for the solve LLM",
    )
    merge_system_message: str = Field(
        default="Please combine the following solutions into a coherent and comprehensive final answer.",
        description="The prompt for the merge LLM",
    )
    llm_info: ModelInfo = Field(
        default_factory=lambda: ModelInfo(
            model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7
        ),
        description="The default LLM model to use",
    )
    input_schema: Dict[str, str] = Field(default={"task": "string"})
    output_schema: Dict[str, str] = Field(default={"response": "string"})


class BranchSolveMergeNodeInput(BaseNodeInput):
    pass


class BranchSolveMergeNodeOutput(BaseNodeOutput):
    pass


class BranchSolveMergeNode(BaseSubworkflowNode):
    name = "branch_solve_merge_node"
    display_name = "Branch Solve Merge"
    config_model = BranchSolveMergeNodeConfig
    input_model = BranchSolveMergeNodeInput
    output_model = BranchSolveMergeNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Run the BranchSolveMergeNode in two steps:
        Step 1: Run the branch node to get subtasks.
        Step 2: Build the rest of the subworkflow based on the subtasks and execute it.
        """
        # Apply templates to config fields
        input_dict = input.model_dump()
        new_config = self.apply_templates_to_config(self.config, input_dict)
        self.update_config(new_config)

        # Step 1: Run the branch node to get the subtasks
        # Build subworkflow for step 1
        self.setup_branch_subworkflow()
        branch_output = await self.run_subworkflow(input)

        # Extract subtasks from branch_output
        subtasks: List[str] = branch_output["subtasks"]
        assert isinstance(subtasks, list)

        # Step 2: Build the subworkflow including solve nodes for each subtask
        self.setup_full_subworkflow(subtasks)

        # Prepare the inputs for the subworkflow, including passing the previous outputs
        # We don't want the branch node to run again, so we pass its output
        self.subworkflow_output = {self.branch_node_id: branch_output}

        # Run the subworkflow starting from solve nodes
        final_output = await self.run_subworkflow(input)

        # Return the output of the output node
        return self.output_model.model_validate(final_output)

    def setup_branch_subworkflow(self) -> None:
        """
        Setup the subworkflow for Step 1: Running the branch node to get subtasks.
        """
        nodes: List[WorkflowNodeSchema] = []
        links: List[WorkflowLinkSchema] = []

        # Input node
        input_node_id = "branch_solve_merge_input_node"
        self.input_node_id = input_node_id
        input_node = WorkflowNodeSchema(
            id=input_node_id,
            node_type="InputNode",
            config={
                "output_schema": {"task": "string"},
                "enforce_schema": False,
            },
        )
        nodes.append(input_node)

        # Branch node: Decompose task into subtasks
        branch_node_id = "branch_node"
        self.branch_node_id = branch_node_id
        branch_node = WorkflowNodeSchema(
            id=branch_node_id,
            node_type="SingleLLMCallNode",
            config={
                "llm_info": self.config.llm_info.model_dump(),
                "system_message": self.config.branch_system_message,
                "user_message": "",
                "output_schema": {"subtasks": "List[str]"},  # Expecting list of subtasks
            },
        )
        nodes.append(branch_node)

        # Link input node to branch node
        links.append(
            WorkflowLinkSchema(
                source_id=input_node_id,
                target_id=branch_node_id,
            )
        )

        # Output node
        output_node_id = "output_node"
        self.output_node_id = output_node_id
        output_node = WorkflowNodeSchema(
            id=output_node_id,
            node_type="OutputNode",
            config={
                "output_schema": {"subtasks": "List[str]"},
                "output_map": {"subtasks": f"{branch_node_id}.subtasks"},
            },
        )
        nodes.append(output_node)

        # Link branch node to output node
        links.append(
            WorkflowLinkSchema(
                source_id=branch_node_id,
                target_id=output_node_id,
            )
        )

        self.subworkflow = WorkflowDefinitionSchema(nodes=nodes, links=links)
        self.setup_subworkflow()

    def setup_full_subworkflow(self, subtasks: List[str]) -> None:
        """
        Setup the subworkflow for Step 2: Solve subtasks and merge solutions.
        This subworkflow reuses the branch node's output and adds solve nodes for each subtask.
        """
        nodes: List[WorkflowNodeSchema] = []
        links: List[WorkflowLinkSchema] = []

        # Input node (same as before)
        input_node_id = self.input_node_id
        input_node = WorkflowNodeSchema(
            id=input_node_id,
            node_type="InputNode",
            config={"echo_mode": True},
        )
        nodes.append(input_node)

        # Branch node (same as before)
        branch_node_id = self.branch_node_id
        branch_node = WorkflowNodeSchema(
            id=branch_node_id,
            node_type="SingleLLMCallNode",
            config={
                "llm_info": self.config.llm_info.model_dump(),
                "system_message": self.config.branch_system_message,
                "user_message": "",
                "output_schema": {"subtasks": "List[str]"},
            },
        )
        nodes.append(branch_node)

        # Link input node to branch node
        links.append(
            WorkflowLinkSchema(
                source_id=input_node_id,
                target_id=branch_node_id,
            )
        )

        # For each subtask, create a solve node
        solve_node_ids: List[str] = []
        for idx, _subtask in enumerate(subtasks):
            solve_node_id = f"solve_node_{idx}"
            solve_node_ids.append(solve_node_id)
            solve_node = WorkflowNodeSchema(
                id=solve_node_id,
                node_type="SingleLLMCallNode",
                config={
                    "llm_info": self.config.llm_info.model_dump(),
                    "system_message": self.config.solve_system_message,
                    "user_message": f"{{{{branch_node.subtasks[{idx}]}}}}",
                    "output_schema": {f"solution_{idx}": "string"},
                },
            )
            nodes.append(solve_node)

            # Link branch node to solve node
            links.append(
                WorkflowLinkSchema(
                    source_id=branch_node_id,
                    target_id=solve_node_id,
                )
            )

        # Merge node: Combine solutions
        merge_node_id = "merge_node"
        merge_node = WorkflowNodeSchema(
            id=merge_node_id,
            node_type="SingleLLMCallNode",
            config={
                "llm_info": self.config.llm_info.model_dump(),
                "system_message": self.config.merge_system_message,
                "user_message": "\n".join(
                    [f"{{{{solve_node_{i}.solution_{i}}}}}" for i in range(len(subtasks))]
                ),
                "output_schema": self.config.output_schema,
            },
        )
        nodes.append(merge_node)

        # Link solve nodes to merge node
        for solve_node_id in solve_node_ids:
            links.append(
                WorkflowLinkSchema(
                    source_id=solve_node_id,
                    target_id=merge_node_id,
                )
            )

        # Output node
        output_node_id = "output_node"
        output_node = WorkflowNodeSchema(
            id=output_node_id,
            node_type="OutputNode",
            config={
                "output_schema": self.config.output_schema,
                "output_map": {
                    key: f"{merge_node_id}.{key}" for key in self.config.output_schema.keys()
                },
            },
        )
        nodes.append(output_node)

        # Link merge node to output node
        links.append(
            WorkflowLinkSchema(
                source_id=merge_node_id,
                target_id=output_node_id,
            )
        )

        # Update subworkflow
        self.subworkflow = WorkflowDefinitionSchema(nodes=nodes, links=links)

        # Since we have already run branch node, we don't want to run it again
        # subworkflow_output stores outputs from previous runs
        self.setup_subworkflow()

    async def run_subworkflow(self, input: BaseModel) -> Dict[str, Any]:
        """
        Run the current subworkflow and return the output of the output node.
        """
        assert self.subworkflow is not None

        # Map input
        mapped_input = self._map_input(input)

        # Prepare inputs for subworkflow
        input_node = next(
            (node for node in self.subworkflow.nodes if node.node_type == "InputNode")
        )
        input_dict = {input_node.id: mapped_input}

        # Use stored outputs to avoid re-running nodes
        precomputed_outputs = self.subworkflow_output or {}

        # Execute the subworkflow
        workflow_executor = WorkflowExecutor(workflow=self.subworkflow, context=self.context)
        outputs = await workflow_executor.run(input_dict, precomputed_outputs=precomputed_outputs)

        # Store outputs for potential reuse
        if self.subworkflow_output is None:
            self.subworkflow_output = outputs
        else:
            self.subworkflow_output.update(outputs)

        # Get the output of the output node
        output_node = next(
            (node for node in self.subworkflow.nodes if node.node_type == "OutputNode")
        )
        return outputs[output_node.id].model_dump()

    def setup(self) -> None:
        # Initial setup
        # We don't set up the subworkflow here because it depends on data available at runtime
        super().setup()


if __name__ == "__main__":
    import asyncio
    from pprint import pprint

    async def main():
        node = BranchSolveMergeNode(
            name="branch_solve_merge_node",
            config=BranchSolveMergeNodeConfig(),
        )

        class TestInput(BranchSolveMergeNodeInput):
            task: str = "Write a joke like Jimmy Carr about alternative medicine."

        input_data = TestInput()
        output = await node(input_data)
        pprint(output)
        pprint(node.subworkflow_output)

    asyncio.run(main())

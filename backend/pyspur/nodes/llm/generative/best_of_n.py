import json
from typing import Dict, List

from pydantic import Field

from ....nodes.base import BaseNodeInput, BaseNodeOutput
from ....schemas.workflow_schemas import (
    WorkflowDefinitionSchema,
    WorkflowLinkSchema,
    WorkflowNodeSchema,
)
from ....utils.pydantic_utils import json_schema_to_simple_schema
from ...subworkflow.base_subworkflow_node import (
    BaseSubworkflowNode,
    BaseSubworkflowNodeConfig,
)
from .._utils import LLMModels, ModelInfo
from ..single_llm_call import SingleLLMCallNodeConfig


class BestOfNNodeConfig(SingleLLMCallNodeConfig, BaseSubworkflowNodeConfig):
    samples: int = Field(default=3, ge=1, le=10, description="Number of samples to generate")
    rating_prompt: str = Field(
        default=(
            "Rate the following response on a scale from 0 to 10, where 0 is poor "
            "and 10 is excellent. Consider factors such as relevance, coherence, "
            "and helpfulness. Respond with only a number."
        ),
        description="The prompt for the rating LLM",
    )
    system_message: str = Field(
        default="You are a helpful assistant.",
        description="System message for the generation LLM",
    )
    user_message: str = Field(default="", description="User message template")
    output_schema: Dict[str, str] = Field(default={"response": "string"})


class BestOfNNodeInput(BaseNodeInput):
    pass


class BestOfNNodeOutput(BaseNodeOutput):
    pass


class BestOfNNode(BaseSubworkflowNode):
    name = "best_of_n_node"
    display_name = "Best of N"
    config_model = BestOfNNodeConfig
    workflow: WorkflowDefinitionSchema

    input_model = BestOfNNodeInput
    output_model = BestOfNNodeOutput

    def setup_subworkflow(self) -> None:
        samples = self.config.samples

        # Generate the nodes for the subworkflow
        nodes: List[WorkflowNodeSchema] = []
        links: List[WorkflowLinkSchema] = []

        # Input node
        input_node_id = "best_of_n_input_node"
        input_node = WorkflowNodeSchema(
            id=input_node_id,
            node_type="InputNode",
            config={"enforce_schema": False},
        )
        nodes.append(input_node)

        generation_node_ids: List[str] = []
        rating_node_ids: List[str] = []

        for i in range(samples):
            gen_node_id = f"generation_node_{i}"
            gen_node = WorkflowNodeSchema(
                id=gen_node_id,
                node_type="SingleLLMCallNode",
                config={
                    "llm_info": self.config.llm_info.model_dump(),
                    "system_message": self.config.system_message,
                    "user_message": self.config.user_message,
                    "output_schema": self.config.output_schema,
                    "output_json_schema": self.config.output_json_schema,
                },
            )
            nodes.append(gen_node)
            generation_node_ids.append(gen_node_id)

            # Link input node to generation node
            links.append(
                WorkflowLinkSchema(
                    source_id=input_node_id,
                    target_id=gen_node_id,
                )
            )

            rate_node_id = f"rating_node_{i}"
            rate_node = WorkflowNodeSchema(
                id=rate_node_id,
                node_type="SingleLLMCallNode",
                config={
                    "llm_info": self.config.llm_info.model_dump(),
                    "system_message": self.config.rating_prompt,
                    "user_message": "",
                    "output_schema": {"rating": "number"},
                    "output_json_schema": '{"type": "object", "properties": {"rating": {"type": "number"} }, "required": ["rating"]}',
                },
            )
            nodes.append(rate_node)
            rating_node_ids.append(rate_node_id)

            # Link generation node to rating node
            links.append(
                WorkflowLinkSchema(
                    source_id=gen_node_id,
                    target_id=rate_node_id,
                )
            )

        # Create a PickOneNode to select the JSON string with the highest rating
        pick_one_node_id = "pick_one_node"
        if self.config.output_json_schema:
            output_schema = json_schema_to_simple_schema(json.loads(self.config.output_json_schema))
        else:
            output_schema = self.config.output_schema
        pick_one_node = WorkflowNodeSchema(
            id=pick_one_node_id,
            node_type="PythonFuncNode",
            config={
                "output_schema": output_schema,
                "output_json_schema": self.config.output_json_schema,
                "code": (
                    """gen_and_ratings = input_model.model_dump()\n"""
                    """print(gen_and_ratings)\n"""
                    """ratings = {k:v['rating'] for k,v in gen_and_ratings.items() if 'rating_node' in k}\n"""
                    """highest_rating_key = max(ratings, key=ratings.get)\n"""
                    """print(highest_rating_key)\n"""
                    """corresponding_gen_key = highest_rating_key.replace('rating_node', 'generation_node')\n"""
                    """return gen_and_ratings[corresponding_gen_key]\n"""
                ),
            },
        )
        nodes.append(pick_one_node)

        # Link all generation nodes to the pick_one_node
        for i, gen_node_id in enumerate(generation_node_ids):
            links.append(
                WorkflowLinkSchema(
                    source_id=gen_node_id,
                    target_id=pick_one_node_id,
                )
            )

        # Link all rating nodes to the pick_one_node
        for i, rate_node_id in enumerate(rating_node_ids):
            links.append(
                WorkflowLinkSchema(
                    source_id=rate_node_id,
                    target_id=pick_one_node_id,
                )
            )

        # add the output node
        output_node_id = "output_node"
        output_node = WorkflowNodeSchema(
            id=output_node_id,
            node_type="OutputNode",
            config={
                "output_map": {f"{k}": f"pick_one_node.{k}" for k in output_schema.keys()},
                "output_schema": output_schema,
                "output_json_schema": self.config.output_json_schema,
            },
        )
        nodes.append(output_node)

        # Link the pick_one_node to the output node
        links.append(
            WorkflowLinkSchema(
                source_id=pick_one_node_id,
                target_id=output_node_id,
            )
        )

        self.subworkflow = WorkflowDefinitionSchema(
            nodes=nodes,
            links=links,
        )
        super().setup_subworkflow()

    def setup(self) -> None:
        self.output_model = self.create_output_model_class(self.config.output_schema)
        super().setup()


if __name__ == "__main__":
    node = BestOfNNode(
        name="best_of_n_node",
        config=BestOfNNodeConfig(
            samples=3,
            rating_prompt="Rate the following response on a scale from 0 to 10, where 0 is poor and 10 is excellent. Consider factors such as relevance, coherence, and helpfulness. Respond with only a number.",
            llm_info=ModelInfo(model=LLMModels.GPT_4O, max_tokens=150, temperature=1),
            system_message="You are a helpful assistant.",
            user_message="",
            output_schema={"response": "string"},
            url_variables=None,
            output_json_schema='{"type": "object", "properties": {"response": {"type": "string"} }, "required": ["response"]}',
        ),
    )
    import asyncio

    class input_model(BaseNodeInput):
        task: str = "write a joke"
        comedian: str = "jimmy carr"

    input = input_model()

    output = asyncio.run(node(input))
    print(output)

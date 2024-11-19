import asyncio
import logging
import random
from typing import Dict, List, Optional

import networkx as nx
import numpy as np
from pydantic import BaseModel, Field

from ..base import BaseNode, VisualTag
from .llm_utils import LLMModels, ModelInfo, create_messages, generate_text

logger = logging.getLogger(__name__)


class DialogueState:
    def __init__(
        self,
        system_prompt: str,
        conversation_history: List[Dict[str, str]],
        current_query: str,
    ):
        self.system_prompt = system_prompt
        self.conversation_history = conversation_history
        self.current_query = current_query

    def __str__(self):
        return (
            f"System: {self.system_prompt}\n"
            f"History: {self.conversation_history}\n"
            f"Current Query: {self.current_query}"
        )


class MCTSTreeNode:
    def __init__(self, state: DialogueState, parent: Optional["MCTSTreeNode"] = None):
        self.state = state
        self.parent = parent
        self.children: List["MCTSTreeNode"] = []
        self.visits = 0
        self.value = 0.0


class MCTSNodeConfig(BaseModel):
    llm_info: ModelInfo = Field(
        ModelInfo(model=LLMModels.GPT_4O, max_tokens=16384, temperature=0.7),
        description="The default LLM model to use"
    )
    system_message: str = Field(
        "You are a helpful assistant.", description="The system message for the LLM"
    )
    user_message: str = Field(
        "What would you like to ask?", description="The user message for the LLM"
    )
    num_simulations: int = Field(
        10, ge=1, le=100, description="Number of simulations to run"
    )
    simulation_depth: int = Field(5, ge=1, le=10, description="Simulation depth")
    exploration_weight: float = Field(
        1.4, ge=0.0, le=2.0, description="Exploration weight"
    )
    few_shot_examples: Optional[List[Dict[str, str]]] = None


class MCTSNodeInput(BaseModel):
    user_message: str


class MCTSNodeOutput(BaseModel):
    assistant_message: str


class MCTSNode(BaseNode):
    name = "mcts_node"
    config_model = MCTSNodeConfig
    input_model = MCTSNodeInput
    output_model = MCTSNodeOutput
    visual_tag = VisualTag(acronym="MCTS", color="#C1C1FF")

    def setup(self) -> None:
        self.graph = nx.Graph()
        self.node_labels: Dict[int, str] = {}
        self.root: Optional[MCTSTreeNode] = None

    async def run(self, input_data: MCTSNodeInput) -> MCTSNodeOutput:
        initial_state = DialogueState(
            system_prompt=self.config.system_prompt,
            conversation_history=[],
            current_query=input_data.user_message,
        )
        final_state = await self.search(initial_state)
        assistant_message = (
            final_state.conversation_history[-1]["content"]
            if final_state.conversation_history
            else ""
        )
        return MCTSNodeOutput(assistant_message=assistant_message)

    async def search(self, initial_state: DialogueState) -> DialogueState:
        if not self.root:
            self.root = MCTSTreeNode(initial_state)
            self.graph.add_node(id(self.root))  # type: ignore because of networkx not having proper types
            self.node_labels[id(self.root)] = f"Root\nVisits: 0\nValue: 0.00"

        async def one_simulation(node: MCTSTreeNode):
            if not await self.is_terminal(node.state):
                node = await self.expand(node)
            value = await self.simulate(node)
            self.backpropagate(node, value)

        simulation_tasks = [
            one_simulation(self.root) for _ in range(self.config.num_simulations)
        ]
        await asyncio.gather(*simulation_tasks)
        best_child = max(self.root.children, key=lambda c: c.visits, default=None)
        return best_child.state if best_child else self.root.state

    def select(self, node: MCTSTreeNode) -> MCTSTreeNode:
        while node.children:
            node = max(
                node.children,
                key=lambda c: self.ucb_score(node, c),
            )
        return node

    def ucb_score(self, parent: MCTSTreeNode, child: MCTSTreeNode) -> float:
        exploitation = child.value / (child.visits + 1e-8)
        exploration = self.config.exploration_weight * np.sqrt(
            np.log(parent.visits + 1) / (child.visits + 1e-8)
        )
        return exploitation + exploration

    async def expand(self, node: MCTSTreeNode) -> MCTSTreeNode:
        actions = await self.generate_actions(node.state)
        for action in actions:
            new_state = await self.apply_action(node.state, action)
            child_node = MCTSTreeNode(new_state, parent=node)
            node.children.append(child_node)
            self.graph.add_edge(id(node), id(child_node))  # type: ignore because of networkx not having proper types
            self.node_labels[id(child_node)] = (
                f"Visits: {child_node.visits}\nValue: {child_node.value:.2f}"
            )
        selected_child = random.choice(node.children)
        return selected_child

    async def simulate(self, node: MCTSTreeNode) -> float:
        state = node.state
        for _ in range(self.config.simulation_depth):
            if await self.is_terminal(state):
                break
            actions = await self.generate_actions(state)
            action = random.choice(actions)
            state = await self.apply_action(state, action)
        value = await self.evaluate_state(state)
        return value

    def backpropagate(self, node: MCTSTreeNode | None, value: float):
        while node:
            node.visits += 1
            node.value += value
            self.node_labels[id(node)] = (
                f"Visits: {node.visits}\nValue: {node.value:.2f}"
            )
            node = node.parent

    async def generate_actions(self, state: DialogueState) -> List[str]:
        messages = create_messages(
            system_message=state.system_prompt,
            user_message=state.current_query,
            history=state.conversation_history,
            few_shot_examples=self.config.few_shot_examples,
        )
        assistant_message = await generate_text(
            messages=messages,
            model_name=self.config.llm_info.name,
            temperature=self.config.llm_info.temperature,
            max_tokens=self.config.llm_info.max_tokens,
        )
        return [assistant_message]

    async def apply_action(self, state: DialogueState, action: str) -> DialogueState:
        new_history = state.conversation_history.copy()
        new_history.append({"role": "assistant", "content": action})
        next_query = await self.generate_next_query(state.system_prompt, new_history)
        return DialogueState(state.system_prompt, new_history, next_query)

    async def generate_next_query(
        self, system_prompt: str, conversation_history: List[Dict[str, str]]
    ) -> str:
        messages = create_messages(
            system_message=system_prompt,
            history=conversation_history,
            user_message="Based on this conversation, what might the user ask or say next? Provide a likely user query.",
        )
        next_query = await generate_text(
            messages=messages,
            model_name=self.config.llm_info.name,
            temperature=self.config.llm_info.temperature,
            max_tokens=1024,
        )
        return next_query

    async def is_terminal(self, state: DialogueState) -> bool:
        return (
            len(state.conversation_history) >= 10
            or "goodbye" in state.current_query.lower()
        )

    async def evaluate_state(self, state: DialogueState) -> float:
        # Use the LLM to evaluate the state
        messages = create_messages(
            system_message=state.system_prompt,
            user_message="Evaluate the quality of this conversation on a scale from 0 to 1. Respond with only a number.",
            history=state.conversation_history,
        )
        evaluation = await generate_text(
            messages=messages,
            model_name=self.config.llm_info.name,
            temperature=0.1,
            max_tokens=10,
        )
        try:
            score = float(evaluation.strip())
            score = max(0.0, min(score, 1.0))
        except ValueError:
            logger.warning(
                f"Failed to parse evaluation score from LLM response: {evaluation}"
            )
            score = 0.5  # Default score if parsing fails
        return score

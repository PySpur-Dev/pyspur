import json
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput
from ...registry import NodeRegistry
import genanki
import os
import random
from typing_extensions import TypeAlias
from jinja2 import Template

# Type aliases for genanki types to help with type checking
GenkaniModel: TypeAlias = Any  # genanki.Model
GenkaniDeck: TypeAlias = Any   # genanki.Deck
GenkaniNote: TypeAlias = Any   # genanki.Note
GenkaniPackage: TypeAlias = Any # genanki.Package


class AnkiBasicNodeInput(BaseNodeInput):
    """Input for the AnkiBasic node - creates cards with just front and back sides"""
    front: List[str] = Field(..., description="List of front (question) sides of the cards. Supports Jinja templating.")
    back: List[str] = Field(..., description="List of back (answer) sides of the cards. Supports Jinja templating.")

    class Config:
        extra = "allow"


class AnkiBasicNodeOutput(BaseNodeOutput):
    """Output for the AnkiBasic node"""
    deck_path: str = Field(..., description="Path to the generated Anki deck file")
    card_count: int = Field(..., description="Number of cards in the generated deck")


class AnkiBasicNodeConfig(BaseNodeConfig):
    """Configuration for the AnkiBasic node"""
    deck_name: str = Field(
        "Generated Basic Deck",
        description="Name of the Anki deck"
    )
    output_dir: str = Field(
        "data/anki_decks",
        description="Directory where the deck file will be saved"
    )
    model_id: Optional[int] = Field(
        None,
        description="Optional unique model ID for the Anki model. If not provided, a random ID will be generated."
    )
    deck_id: Optional[int] = Field(
        None,
        description="Optional unique deck ID for the Anki deck. If not provided, a random ID will be generated."
    )
    has_fixed_output: bool = True
    output_json_schema: str = Field(
        default=json.dumps(AnkiBasicNodeOutput.model_json_schema()),
        description="The JSON schema for the output of the node"
    )


# @NodeRegistry.register(
#     category="Integrations",
#     display_name="Anki Basic Card Generator",
#     logo="/images/anki.png",
#     subcategory="Flashcards",
# )
class AnkiBasicNode(BaseNode):
    """Node for generating Anki decks with basic cards (front/back only)"""
    name = "anki_basic_node"
    display_name = "AnkiBasicNode"
    logo = "/images/anki.png"
    category = "Anki"

    config_model = AnkiBasicNodeConfig
    input_model = AnkiBasicNodeInput
    output_model = AnkiBasicNodeOutput

    def __init__(self, name: str, config: AnkiBasicNodeConfig, context: Optional[Any] = None) -> None:
        super().__init__(name=name, config=config, context=context)
        # Create output directory if it doesn't exist
        os.makedirs(self.config.output_dir, exist_ok=True)

    def _render_template(self, template_str: str, data: Dict[str, Any]) -> str:
        """Render a Jinja template string with the provided data"""
        try:
            return Template(template_str).render(**data)
        except Exception as e:
            print(f"[ERROR] Failed to render template in {self.name}")
            print(f"[ERROR] Template: {template_str}")
            raise e

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Generate an Anki deck with basic cards from the provided front and back templates.
        """
        input_typed = AnkiBasicNodeInput.model_validate(input)

        if len(input_typed.front) != len(input_typed.back):
            raise ValueError("Number of front and back entries must match")

        # Generate random IDs if not provided
        model_id = self.config.model_id or random.randrange(1 << 30, 1 << 31)
        deck_id = self.config.deck_id or random.randrange(1 << 30, 1 << 31)

        # Create the basic Anki model
        model: GenkaniModel = genanki.Model(
            model_id,
            'Basic',
            fields=[
                {'name': 'Front'},
                {'name': 'Back'},
            ],
            templates=[
                {
                    'name': 'Card 1',
                    'qfmt': '{{Front}}',
                    'afmt': '{{FrontSide}}<hr id="answer">{{Back}}',
                },
            ])

        # Create the deck
        deck: GenkaniDeck = genanki.Deck(
            deck_id,
            self.config.deck_name
        )

        # Get input data for template rendering
        input_data = input_typed.model_dump()

        # Add cards to the deck
        for front_template, back_template in zip(input_typed.front, input_typed.back):
            # Render templates
            front_rendered = self._render_template(front_template, input_data)
            back_rendered = self._render_template(back_template, input_data)

            note: GenkaniNote = genanki.Note(
                model=model,
                fields=[front_rendered, back_rendered]
            )
            deck.add_note(note)

        # Generate unique filename
        output_path = os.path.join(
            self.config.output_dir,
            f"{self.config.deck_name.lower().replace(' ', '_')}_{deck_id}.apkg"
        )

        # Save the deck
        package: GenkaniPackage = genanki.Package(deck)
        package.write_to_file(output_path)

        output = AnkiBasicNodeOutput(
            deck_path=output_path,
            card_count=len(input_typed.front)
        )
        return output


if __name__ == "__main__":
    # Example usage of the AnkiBasic node
    import asyncio

    async def example() -> None:
        # Create node configuration
        config = AnkiBasicNodeConfig(
            deck_name="Programming Concepts",
            output_dir="data/anki_decks"
        )

        # Create node instance
        node = AnkiBasicNode(name="example_node", config=config)

        # Prepare input data with templates
        input_data = AnkiBasicNodeInput(
            front=[
                "What is {{concept}}?",
                "Explain the difference between {{thing1}} and {{thing2}}?"
            ],
            back=[
                "{{concept}} is {{definition}}",
                "The key differences are:\n{{differences}}"
            ]
        )

        # Add template variables to the input
        input_data.concept = "recursion"  # type: ignore
        input_data.definition = "a programming concept where a function calls itself"  # type: ignore
        input_data.thing1 = "list"  # type: ignore
        input_data.thing2 = "tuple"  # type: ignore
        input_data.differences = "Lists are mutable, tuples are immutable"  # type: ignore

        # Run the node
        result = await node.run(input_data)
        result_typed = AnkiBasicNodeOutput.model_validate(result)

        # Print results
        print(f"Generated Anki deck at: {result_typed.deck_path}")
        print(f"Number of cards: {result_typed.card_count}")

    # Run the example
    asyncio.run(example())
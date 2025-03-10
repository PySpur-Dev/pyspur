from enum import Enum
from typing import Optional, Set

from pydantic import BaseModel

from ...utils.mime_types_utils import (
    MIME_TYPES_BY_CATEGORY,
    MimeCategory,
    RecognisedMimeType,
)


class LLMProvider(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    OLLAMA = "ollama"
    AZURE_OPENAI = "azure"
    DEEPSEEK = "deepseek"


class ModelConstraints(BaseModel):
    max_tokens: int
    min_temperature: float = 0.0
    max_temperature: float = 1.0
    supports_JSON_output: bool = True
    supports_max_tokens: bool = True
    supports_temperature: bool = True
    supported_mime_types: Set[RecognisedMimeType] = set()  # Empty set means no multimodal support
    supports_reasoning: bool = False
    reasoning_separator: str = r"<think>.*?</think>"
    supports_thinking: bool = False
    thinking_budget_tokens: Optional[int] = None

    def add_mime_categories(self, categories: Set[MimeCategory]) -> "ModelConstraints":
        """Add MIME type support for entire categories.

        Args:
            categories: Set of MimeCategory to add support for. All MIME types
                      in these categories will be added.

        Returns:
            self: Returns self for method chaining.

        """
        for category in categories:
            self.supported_mime_types.update(MIME_TYPES_BY_CATEGORY[category])
        return self

    def add_mime_types(self, mime_types: Set[RecognisedMimeType]) -> "ModelConstraints":
        """Add support for specific MIME types.

        Args:
            mime_types: Set of specific RecognisedMimeType to add support for.

        Returns:
            self: Returns self for method chaining.

        """
        self.supported_mime_types.update(mime_types)
        return self

    def is_mime_type_supported(self, mime_type: RecognisedMimeType) -> bool:
        """Check if a specific MIME type is supported.

        Args:
            mime_type: The RecognisedMimeType to check.

        Returns:
            bool: True if the MIME type is supported, False otherwise.

        """
        return mime_type in self.supported_mime_types


class LLMModel(BaseModel):
    id: str
    provider: LLMProvider
    name: str
    constraints: ModelConstraints


class LLMModels(str, Enum):
    # OpenAI Models
    O3_MINI = "openai/o3-mini"
    O3_MINI_2025_01_31 = "openai/o3-mini-2025-01-31"
    GPT_4O_MINI = "openai/gpt-4o-mini"
    GPT_4O = "openai/gpt-4o"
    O1_PREVIEW = "openai/o1-preview"
    O1_MINI = "openai/o1-mini"
    O1 = "openai/o1"
    O1_2024_12_17 = "openai/o1-2024-12-17"
    O1_MINI_2024_09_12 = "openai/o1-mini-2024-09-12"
    O1_PREVIEW_2024_09_12 = "openai/o1-preview-2024-09-12"
    CHATGPT_4O_LATEST = "openai/chatgpt-4o-latest"

    # Azure OpenAI Models
    AZURE_GPT_4 = "azure/gpt-4"
    AZURE_GPT_35_TURBO = "azure/gpt-35-turbo"

    # Anthropic Models
    CLAUDE_3_5_SONNET_LATEST = "anthropic/claude-3-5-sonnet-latest"
    CLAUDE_3_5_HAIKU_LATEST = "anthropic/claude-3-5-haiku-latest"
    CLAUDE_3_OPUS_LATEST = "anthropic/claude-3-opus-latest"
    CLAUDE_3_7_SONNET_LATEST = "anthropic/claude-3-7-sonnet-latest"

    # Google Models
    GEMINI_2_0_FLASH_EXP = "gemini/gemini-2.0-flash-exp"
    GEMINI_2_0_FLASH = "gemini/gemini-2.0-flash"
    GEMINI_1_5_PRO = "gemini/gemini-1.5-pro"
    GEMINI_1_5_FLASH = "gemini/gemini-1.5-flash"
    GEMINI_1_5_PRO_LATEST = "gemini/gemini-1.5-pro-latest"
    GEMINI_1_5_FLASH_LATEST = "gemini/gemini-1.5-flash-latest"

    # Deepseek Models
    DEEPSEEK_CHAT = "deepseek/deepseek-chat"
    DEEPSEEK_REASONER = "deepseek/deepseek-reasoner"

    # Ollama Models
    OLLAMA_MISTRAL_SMALL = "ollama/mistral-small:24b"
    OLLAMA_DEEPSEEK_R1 = "ollama/deepseek-r1"
    OLLAMA_PHI4 = "ollama/phi4"
    OLLAMA_LLAMA3_3_70B = "ollama/llama3.3:70b"
    OLLAMA_LLAMA3_3_8B = "ollama/llama3.3:8b"
    OLLAMA_LLAMA3_2_8B = "ollama/llama3.2:8b"
    OLLAMA_LLAMA3_2_1B = "ollama/llama3.2:1b"
    OLLAMA_LLAMA3_8B = "ollama/llama3"
    OLLAMA_GEMMA_2 = "ollama/gemma2"
    OLLAMA_GEMMA_2_2B = "ollama/gemma2:2b"
    OLLAMA_MISTRAL = "ollama/mistral"
    OLLAMA_CODELLAMA = "ollama/codellama"
    OLLAMA_MIXTRAL = "ollama/mixtral-8x7b-instruct-v0.1"

    @classmethod
    def get_model_info(cls, model_id: str) -> LLMModel | None:
        model_registry = {
            cls.O3_MINI.value: LLMModel(
                id=cls.O3_MINI.value,
                provider=LLMProvider.OPENAI,
                name="O3 Mini",
                constraints=ModelConstraints(
                    max_tokens=100000,
                    max_temperature=2.0,
                    supports_max_tokens=False,
                    supports_temperature=False,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.O3_MINI_2025_01_31.value: LLMModel(
                id=cls.O3_MINI_2025_01_31.value,
                provider=LLMProvider.OPENAI,
                name="O3 Mini (2025-01-31)",
                constraints=ModelConstraints(
                    max_tokens=100000,
                    max_temperature=2.0,
                    supports_max_tokens=False,
                    supports_temperature=False,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.GPT_4O_MINI.value: LLMModel(
                id=cls.GPT_4O_MINI.value,
                provider=LLMProvider.OPENAI,
                name="GPT-4O Mini",
                constraints=ModelConstraints(
                    max_tokens=16384, max_temperature=2.0
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.GPT_4O.value: LLMModel(
                id=cls.GPT_4O.value,
                provider=LLMProvider.OPENAI,
                name="GPT-4O",
                constraints=ModelConstraints(
                    max_tokens=16384, max_temperature=2.0
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.O1_PREVIEW.value: LLMModel(
                id=cls.O1_PREVIEW.value,
                provider=LLMProvider.OPENAI,
                name="O1 Preview",
                constraints=ModelConstraints(
                    max_tokens=32768,
                    max_temperature=2.0,
                    supports_max_tokens=False,
                    supports_temperature=False,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.O1_MINI.value: LLMModel(
                id=cls.O1_MINI.value,
                provider=LLMProvider.OPENAI,
                name="O1 Mini",
                constraints=ModelConstraints(
                    max_tokens=65536,
                    max_temperature=2.0,
                    supports_max_tokens=False,
                    supports_temperature=False,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.O1.value: LLMModel(
                id=cls.O1.value,
                provider=LLMProvider.OPENAI,
                name="O1",
                constraints=ModelConstraints(
                    max_tokens=100000,
                    max_temperature=2.0,
                    supports_max_tokens=False,
                    supports_temperature=False,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.O1_2024_12_17.value: LLMModel(
                id=cls.O1_2024_12_17.value,
                provider=LLMProvider.OPENAI,
                name="O1 (2024-12-17)",
                constraints=ModelConstraints(
                    max_tokens=100000,
                    max_temperature=2.0,
                    supports_max_tokens=False,
                    supports_temperature=False,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.O1_MINI_2024_09_12.value: LLMModel(
                id=cls.O1_MINI_2024_09_12.value,
                provider=LLMProvider.OPENAI,
                name="O1 Mini (2024-09-12)",
                constraints=ModelConstraints(
                    max_tokens=65536,
                    max_temperature=2.0,
                    supports_max_tokens=False,
                    supports_temperature=False,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.O1_PREVIEW_2024_09_12.value: LLMModel(
                id=cls.O1_PREVIEW_2024_09_12.value,
                provider=LLMProvider.OPENAI,
                name="O1 Preview (2024-09-12)",
                constraints=ModelConstraints(
                    max_tokens=32768,
                    max_temperature=2.0,
                    supports_max_tokens=False,
                    supports_temperature=False,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.CHATGPT_4O_LATEST.value: LLMModel(
                id=cls.CHATGPT_4O_LATEST.value,
                provider=LLMProvider.OPENAI,
                name="ChatGPT-4 Optimized Latest",
                constraints=ModelConstraints(
                    max_tokens=4096, max_temperature=2.0
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            # Azure OpenAI Models
            cls.AZURE_GPT_4.value: LLMModel(
                id=cls.AZURE_GPT_4.value,
                provider=LLMProvider.AZURE_OPENAI,
                name="Azure GPT-4",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.AZURE_GPT_35_TURBO.value: LLMModel(
                id=cls.AZURE_GPT_35_TURBO.value,
                provider=LLMProvider.AZURE_OPENAI,
                name="Azure GPT-3.5 Turbo",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            # Anthropic Models
            cls.CLAUDE_3_5_SONNET_LATEST.value: LLMModel(
                id=cls.CLAUDE_3_5_SONNET_LATEST.value,
                provider=LLMProvider.ANTHROPIC,
                name="Claude 3.5 Sonnet Latest",
                constraints=ModelConstraints(
                    max_tokens=8192,
                    max_temperature=1.0,
                ).add_mime_categories({MimeCategory.IMAGES, MimeCategory.DOCUMENTS}),
            ),
            cls.CLAUDE_3_5_HAIKU_LATEST.value: LLMModel(
                id=cls.CLAUDE_3_5_HAIKU_LATEST.value,
                provider=LLMProvider.ANTHROPIC,
                name="Claude 3.5 Haiku Latest",
                constraints=ModelConstraints(
                    max_tokens=8192,
                    max_temperature=1.0,
                ),
            ),
            cls.CLAUDE_3_OPUS_LATEST.value: LLMModel(
                id=cls.CLAUDE_3_OPUS_LATEST.value,
                provider=LLMProvider.ANTHROPIC,
                name="Claude 3 Opus Latest",
                constraints=ModelConstraints(
                    max_tokens=4096,
                    max_temperature=1.0,
                ).add_mime_categories({MimeCategory.IMAGES}),
            ),
            cls.CLAUDE_3_7_SONNET_LATEST.value: LLMModel(
                id=cls.CLAUDE_3_7_SONNET_LATEST.value,
                provider=LLMProvider.ANTHROPIC,
                name="Claude 3.7 Sonnet Latest",
                constraints=ModelConstraints(
                    max_tokens=8192,
                    max_temperature=1.0,
                    supports_thinking=True,
                    thinking_budget_tokens=1024,
                ).add_mime_categories({MimeCategory.IMAGES, MimeCategory.DOCUMENTS}),
            ),
            # Google Models
            cls.GEMINI_1_5_PRO.value: LLMModel(
                id=cls.GEMINI_1_5_PRO.value,
                provider=LLMProvider.GEMINI,
                name="Gemini 1.5 Pro",
                constraints=ModelConstraints(
                    max_tokens=8192,
                    max_temperature=1.0,
                ).add_mime_categories({MimeCategory.IMAGES, MimeCategory.AUDIO}),
            ),
            cls.GEMINI_1_5_FLASH.value: LLMModel(
                id=cls.GEMINI_1_5_FLASH.value,
                provider=LLMProvider.GEMINI,
                name="Gemini 1.5 Flash",
                constraints=ModelConstraints(
                    max_tokens=8192, max_temperature=1.0
                ).add_mime_categories(
                    {
                        MimeCategory.IMAGES,
                        MimeCategory.AUDIO,
                        MimeCategory.VIDEO,
                        MimeCategory.DOCUMENTS,
                        MimeCategory.TEXT,
                    }
                ),
            ),
            cls.GEMINI_1_5_PRO_LATEST.value: LLMModel(
                id=cls.GEMINI_1_5_PRO_LATEST.value,
                provider=LLMProvider.GEMINI,
                name="Gemini 1.5 Pro Latest",
                constraints=ModelConstraints(
                    max_tokens=8192, max_temperature=1.0
                ).add_mime_categories(
                    {
                        MimeCategory.IMAGES,
                        MimeCategory.AUDIO,
                        MimeCategory.VIDEO,
                        MimeCategory.DOCUMENTS,
                        MimeCategory.TEXT,
                    }
                ),
            ),
            cls.GEMINI_1_5_FLASH_LATEST.value: LLMModel(
                id=cls.GEMINI_1_5_FLASH_LATEST.value,
                provider=LLMProvider.GEMINI,
                name="Gemini 1.5 Flash Latest",
                constraints=ModelConstraints(
                    max_tokens=8192, max_temperature=1.0
                ).add_mime_categories(
                    {
                        MimeCategory.IMAGES,
                        MimeCategory.AUDIO,
                        MimeCategory.VIDEO,
                        MimeCategory.DOCUMENTS,
                        MimeCategory.TEXT,
                    }
                ),
            ),
            cls.GEMINI_2_0_FLASH_EXP.value: LLMModel(
                id=cls.GEMINI_2_0_FLASH_EXP.value,
                provider=LLMProvider.GEMINI,
                name="Gemini 2.0 Flash Exp",
                constraints=ModelConstraints(
                    max_tokens=8192, max_temperature=1.0
                ).add_mime_categories(
                    {
                        MimeCategory.IMAGES,
                        MimeCategory.AUDIO,
                        MimeCategory.VIDEO,
                        MimeCategory.DOCUMENTS,
                        MimeCategory.TEXT,
                    }
                ),
            ),
            cls.GEMINI_2_0_FLASH.value: LLMModel(
                id=cls.GEMINI_2_0_FLASH.value,
                provider=LLMProvider.GEMINI,
                name="Gemini 2.0 Flash",
                constraints=ModelConstraints(
                    max_tokens=8192,
                    max_temperature=2.0,
                ).add_mime_categories(
                    {
                        MimeCategory.IMAGES,
                        MimeCategory.AUDIO,
                        MimeCategory.VIDEO,
                        MimeCategory.DOCUMENTS,
                        MimeCategory.TEXT,
                    }
                ),
            ),
            # Deepseek Models
            cls.DEEPSEEK_CHAT.value: LLMModel(
                id=cls.DEEPSEEK_CHAT.value,
                provider=LLMProvider.DEEPSEEK,
                name="Deepseek Chat",
                constraints=ModelConstraints(
                    max_tokens=8192,
                    max_temperature=2.0,
                    supports_JSON_output=False,
                ),
            ),
            cls.DEEPSEEK_REASONER.value: LLMModel(
                id=cls.DEEPSEEK_REASONER.value,
                provider=LLMProvider.DEEPSEEK,
                name="Deepseek Reasoner",
                constraints=ModelConstraints(
                    max_tokens=8192,
                    max_temperature=2.0,
                    supports_JSON_output=False,
                    supports_max_tokens=False,
                ),
            ),
            # Ollama Models
            cls.OLLAMA_PHI4.value: LLMModel(
                id=cls.OLLAMA_PHI4.value,
                provider=LLMProvider.OLLAMA,
                name="Phi 4",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_LLAMA3_3_70B.value: LLMModel(
                id=cls.OLLAMA_LLAMA3_3_70B.value,
                provider=LLMProvider.OLLAMA,
                name="Llama 3.3 (70B)",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_LLAMA3_3_8B.value: LLMModel(
                id=cls.OLLAMA_LLAMA3_3_8B.value,
                provider=LLMProvider.OLLAMA,
                name="Llama 3.3 (8B)",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_LLAMA3_2_8B.value: LLMModel(
                id=cls.OLLAMA_LLAMA3_2_8B.value,
                provider=LLMProvider.OLLAMA,
                name="Llama 3.2 (8B)",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_LLAMA3_2_1B.value: LLMModel(
                id=cls.OLLAMA_LLAMA3_2_1B.value,
                provider=LLMProvider.OLLAMA,
                name="Llama 3.2 (1B)",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_LLAMA3_8B.value: LLMModel(
                id=cls.OLLAMA_LLAMA3_8B.value,
                provider=LLMProvider.OLLAMA,
                name="Llama 3 (8B)",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_GEMMA_2.value: LLMModel(
                id=cls.OLLAMA_GEMMA_2.value,
                provider=LLMProvider.OLLAMA,
                name="Gemma 2",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_GEMMA_2_2B.value: LLMModel(
                id=cls.OLLAMA_GEMMA_2_2B.value,
                provider=LLMProvider.OLLAMA,
                name="Gemma 2 (2B)",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_MISTRAL.value: LLMModel(
                id=cls.OLLAMA_MISTRAL.value,
                provider=LLMProvider.OLLAMA,
                name="Mistral",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_CODELLAMA.value: LLMModel(
                id=cls.OLLAMA_CODELLAMA.value,
                provider=LLMProvider.OLLAMA,
                name="CodeLlama",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_MIXTRAL.value: LLMModel(
                id=cls.OLLAMA_MIXTRAL.value,
                provider=LLMProvider.OLLAMA,
                name="Mixtral 8x7B Instruct",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
            cls.OLLAMA_DEEPSEEK_R1.value: LLMModel(
                id=cls.OLLAMA_DEEPSEEK_R1.value,
                provider=LLMProvider.OLLAMA,
                name="Deepseek R1",
                constraints=ModelConstraints(
                    max_tokens=8192,
                    max_temperature=2.0,
                    supports_JSON_output=False,
                    supports_max_tokens=False,
                    supports_reasoning=True,
                ),
            ),
            cls.OLLAMA_MISTRAL_SMALL.value: LLMModel(
                id=cls.OLLAMA_MISTRAL_SMALL.value,
                provider=LLMProvider.OLLAMA,
                name="Mistral Small 24B",
                constraints=ModelConstraints(max_tokens=4096, max_temperature=2.0),
            ),
        }
        return model_registry.get(model_id)

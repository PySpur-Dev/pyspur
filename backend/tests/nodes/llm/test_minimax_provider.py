"""Tests for MiniMax provider integration in PySpur.

These tests are designed to work with Python 3.10+ by directly importing
only the modules that don't require Python 3.11+ features.
"""

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure backend is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))

from pyspur.nodes.llm._model_info import (
    LLMModel,
    LLMModels,
    LLMProvider,
    ModelConstraints,
)


# ============================================================
# Unit Tests: Model Registry
# ============================================================


class TestMiniMaxProviderEnum:
    """Test MiniMax is correctly registered in LLMProvider enum."""

    def test_minimax_in_provider_enum(self):
        assert hasattr(LLMProvider, "MINIMAX")
        assert LLMProvider.MINIMAX.value == "minimax"

    def test_minimax_is_string_enum(self):
        assert isinstance(LLMProvider.MINIMAX, str)
        assert LLMProvider.MINIMAX == "minimax"


class TestMiniMaxModelEnum:
    """Test MiniMax models are correctly registered in LLMModels enum."""

    def test_minimax_m2_7_enum(self):
        assert hasattr(LLMModels, "MINIMAX_M2_7")
        assert LLMModels.MINIMAX_M2_7.value == "minimax/MiniMax-M2.7"

    def test_minimax_m2_5_enum(self):
        assert hasattr(LLMModels, "MINIMAX_M2_5")
        assert LLMModels.MINIMAX_M2_5.value == "minimax/MiniMax-M2.5"

    def test_minimax_m2_5_highspeed_enum(self):
        assert hasattr(LLMModels, "MINIMAX_M2_5_HIGHSPEED")
        assert LLMModels.MINIMAX_M2_5_HIGHSPEED.value == "minimax/MiniMax-M2.5-highspeed"


class TestMiniMaxModelInfo:
    """Test MiniMax model info is correctly registered."""

    def test_m2_7_model_info(self):
        info = LLMModels.get_model_info("minimax/MiniMax-M2.7")
        assert info is not None
        assert isinstance(info, LLMModel)
        assert info.provider == LLMProvider.MINIMAX
        assert info.name == "MiniMax M2.7"

    def test_m2_5_model_info(self):
        info = LLMModels.get_model_info("minimax/MiniMax-M2.5")
        assert info is not None
        assert info.provider == LLMProvider.MINIMAX
        assert info.name == "MiniMax M2.5"

    def test_m2_5_highspeed_model_info(self):
        info = LLMModels.get_model_info("minimax/MiniMax-M2.5-highspeed")
        assert info is not None
        assert info.provider == LLMProvider.MINIMAX
        assert info.name == "MiniMax M2.5 (High Speed)"

    def test_unknown_model_returns_none(self):
        info = LLMModels.get_model_info("minimax/nonexistent-model")
        assert info is None


class TestMiniMaxModelConstraints:
    """Test MiniMax model constraints are correct."""

    @pytest.mark.parametrize(
        "model_id",
        [
            "minimax/MiniMax-M2.7",
            "minimax/MiniMax-M2.5",
            "minimax/MiniMax-M2.5-highspeed",
        ],
    )
    def test_temperature_range(self, model_id):
        info = LLMModels.get_model_info(model_id)
        assert info is not None
        assert info.constraints.min_temperature == 0.0
        assert info.constraints.max_temperature == 1.0

    @pytest.mark.parametrize(
        "model_id",
        [
            "minimax/MiniMax-M2.7",
            "minimax/MiniMax-M2.5",
            "minimax/MiniMax-M2.5-highspeed",
        ],
    )
    def test_json_output_supported(self, model_id):
        info = LLMModels.get_model_info(model_id)
        assert info is not None
        assert info.constraints.supports_JSON_output is True

    @pytest.mark.parametrize(
        "model_id",
        [
            "minimax/MiniMax-M2.7",
            "minimax/MiniMax-M2.5",
            "minimax/MiniMax-M2.5-highspeed",
        ],
    )
    def test_max_tokens(self, model_id):
        info = LLMModels.get_model_info(model_id)
        assert info is not None
        assert info.constraints.max_tokens == 8192

    @pytest.mark.parametrize(
        "model_id",
        [
            "minimax/MiniMax-M2.7",
            "minimax/MiniMax-M2.5",
            "minimax/MiniMax-M2.5-highspeed",
        ],
    )
    def test_supports_temperature(self, model_id):
        info = LLMModels.get_model_info(model_id)
        assert info is not None
        assert info.constraints.supports_temperature is True

    @pytest.mark.parametrize(
        "model_id",
        [
            "minimax/MiniMax-M2.7",
            "minimax/MiniMax-M2.5",
            "minimax/MiniMax-M2.5-highspeed",
        ],
    )
    def test_supports_max_tokens(self, model_id):
        info = LLMModels.get_model_info(model_id)
        assert info is not None
        assert info.constraints.supports_max_tokens is True

    @pytest.mark.parametrize(
        "model_id",
        [
            "minimax/MiniMax-M2.7",
            "minimax/MiniMax-M2.5",
            "minimax/MiniMax-M2.5-highspeed",
        ],
    )
    def test_no_multimodal_support(self, model_id):
        """MiniMax is text-only, no multimodal support."""
        info = LLMModels.get_model_info(model_id)
        assert info is not None
        assert len(info.constraints.supported_mime_types) == 0

    @pytest.mark.parametrize(
        "model_id",
        [
            "minimax/MiniMax-M2.7",
            "minimax/MiniMax-M2.5",
            "minimax/MiniMax-M2.5-highspeed",
        ],
    )
    def test_no_reasoning_support(self, model_id):
        info = LLMModels.get_model_info(model_id)
        assert info is not None
        assert info.constraints.supports_reasoning is False
        assert info.constraints.supports_thinking is False


# ============================================================
# Unit Tests: Provider Configuration (with mocked imports)
# ============================================================


class TestMiniMaxProviderConfig:
    """Test MiniMax provider configuration in key_management."""

    @pytest.fixture(autouse=True)
    def _setup_mocks(self):
        """Mock out deep imports that require Python 3.11+."""
        # Mock the rag imports that key_management.py needs
        mock_modules = {
            "pyzerox": MagicMock(),
            "exa_py": MagicMock(),
            "chromadb": MagicMock(),
            "chromadb.config": MagicMock(),
            "pinecone": MagicMock(),
            "weaviate": MagicMock(),
            "supabase": MagicMock(),
        }
        with patch.dict(sys.modules, mock_modules):
            yield

    def test_minimax_in_provider_configs(self):
        # Re-import to pick up mocked deps
        from pyspur.api.key_management import PROVIDER_CONFIGS

        minimax_config = next(
            (p for p in PROVIDER_CONFIGS if p.id == "minimax"), None
        )
        assert minimax_config is not None
        assert minimax_config.name == "MiniMax"
        assert minimax_config.category == "llm"

    def test_minimax_api_key_parameter(self):
        from pyspur.api.key_management import PROVIDER_CONFIGS

        minimax_config = next(
            (p for p in PROVIDER_CONFIGS if p.id == "minimax"), None
        )
        assert minimax_config is not None
        assert len(minimax_config.parameters) == 1
        assert minimax_config.parameters[0].name == "MINIMAX_API_KEY"
        assert minimax_config.parameters[0].type == "password"

    def test_minimax_in_model_provider_keys(self):
        from pyspur.api.key_management import MODEL_PROVIDER_KEYS

        key_names = [k["name"] for k in MODEL_PROVIDER_KEYS]
        assert "MINIMAX_API_KEY" in key_names

    def test_minimax_has_icon(self):
        from pyspur.api.key_management import PROVIDER_CONFIGS

        minimax_config = next(
            (p for p in PROVIDER_CONFIGS if p.id == "minimax"), None
        )
        assert minimax_config is not None
        assert minimax_config.icon == "minimax"


# ============================================================
# Unit Tests: LLM Routing (with mocked litellm)
# ============================================================


class TestMiniMaxRouting:
    """Test MiniMax routing in completion_with_backoff."""

    @pytest.fixture(autouse=True)
    def _patch_acompletion(self):
        """Pre-patch acompletion before any test to ensure mock is in place."""
        self.mock_response = MagicMock()
        self.mock_response.choices = [MagicMock()]
        self.mock_response.choices[0].message = MagicMock(content="test response")

        # Import the module to ensure it's loaded, then patch
        import pyspur.nodes.llm._utils as utils_module

        self._original_acompletion = utils_module.acompletion
        self.mock_acompletion = AsyncMock(return_value=self.mock_response)
        utils_module.acompletion = self.mock_acompletion
        yield
        utils_module.acompletion = self._original_acompletion

    @pytest.mark.asyncio
    async def test_minimax_routing_uses_openai_compat(self):
        """Test that minimax/ prefix routes through OpenAI-compatible handler."""
        with patch.dict(os.environ, {"MINIMAX_API_KEY": "test-key"}):
            from pyspur.nodes.llm._utils import completion_with_backoff

            await completion_with_backoff(
                model="minimax/MiniMax-M2.7",
                messages=[{"role": "user", "content": "Hello"}],
                temperature=0.7,
                max_tokens=100,
            )

            self.mock_acompletion.assert_called_once()
            call_kwargs = self.mock_acompletion.call_args
            # Check the model was transformed to openai/ prefix
            assert "openai/MiniMax-M2.7" in str(call_kwargs)
            # Check api_base was set
            assert "https://api.minimax.io/v1" in str(call_kwargs)

    @pytest.mark.asyncio
    async def test_minimax_not_routed_to_azure(self):
        """Test that minimax/ prefix is NOT routed through Azure even if Azure key is set."""
        with patch(
            "pyspur.nodes.llm._utils.setup_azure_configuration"
        ) as mock_azure, patch.dict(
            os.environ,
            {
                "AZURE_OPENAI_API_KEY": "azure-key",
                "MINIMAX_API_KEY": "minimax-key",
            },
        ):
            from pyspur.nodes.llm._utils import completion_with_backoff

            await completion_with_backoff(
                model="minimax/MiniMax-M2.7",
                messages=[{"role": "user", "content": "Hello"}],
            )

            mock_azure.assert_not_called()

    @pytest.mark.asyncio
    async def test_minimax_custom_api_base(self):
        """Test that custom MINIMAX_API_BASE env var is used if set."""
        with patch.dict(
            os.environ,
            {
                "MINIMAX_API_KEY": "test-key",
                "MINIMAX_API_BASE": "https://custom.minimax.io/v1",
            },
        ):
            from pyspur.nodes.llm._utils import completion_with_backoff

            await completion_with_backoff(
                model="minimax/MiniMax-M2.5",
                messages=[{"role": "user", "content": "Hello"}],
            )

            call_kwargs = self.mock_acompletion.call_args
            assert "https://custom.minimax.io/v1" in str(call_kwargs)

    @pytest.mark.asyncio
    async def test_minimax_m2_5_highspeed_routing(self):
        """Test that M2.5 highspeed model routes correctly."""
        with patch.dict(os.environ, {"MINIMAX_API_KEY": "test-key"}):
            from pyspur.nodes.llm._utils import completion_with_backoff

            await completion_with_backoff(
                model="minimax/MiniMax-M2.5-highspeed",
                messages=[{"role": "user", "content": "Hello"}],
            )

            call_kwargs = self.mock_acompletion.call_args
            assert "openai/MiniMax-M2.5-highspeed" in str(call_kwargs)


# ============================================================
# Integration Tests (require MINIMAX_API_KEY)
# ============================================================


@pytest.mark.skipif(
    not os.environ.get("MINIMAX_API_KEY"),
    reason="MINIMAX_API_KEY not set",
)
class TestMiniMaxIntegration:
    """Integration tests that call the real MiniMax API."""

    @pytest.mark.asyncio
    async def test_minimax_m2_7_completion(self):
        """Test real completion with MiniMax M2.7."""
        from pyspur.nodes.llm._utils import completion_with_backoff

        result = await completion_with_backoff(
            model="minimax/MiniMax-M2.7",
            messages=[{"role": "user", "content": "Say hello in one word."}],
            temperature=0.1,
            max_tokens=10,
        )
        assert result is not None
        assert hasattr(result, "content")
        assert len(result.content) > 0

    @pytest.mark.asyncio
    async def test_minimax_m2_5_highspeed_completion(self):
        """Test real completion with MiniMax M2.5 High Speed."""
        from pyspur.nodes.llm._utils import completion_with_backoff

        result = await completion_with_backoff(
            model="minimax/MiniMax-M2.5-highspeed",
            messages=[{"role": "user", "content": "Say hello in one word."}],
            temperature=0.1,
            max_tokens=10,
        )
        assert result is not None
        assert hasattr(result, "content")
        assert len(result.content) > 0

    @pytest.mark.asyncio
    async def test_minimax_generate_text_json_mode(self):
        """Test generate_text with MiniMax in JSON mode."""
        from pyspur.nodes.llm._utils import generate_text

        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Return a JSON with key 'greeting' and value 'hello'."},
        ]
        result = await generate_text(
            messages=messages,
            model_name="minimax/MiniMax-M2.7",
            temperature=0.1,
            json_mode=True,
            max_tokens=100,
        )
        assert result is not None
        assert hasattr(result, "content")

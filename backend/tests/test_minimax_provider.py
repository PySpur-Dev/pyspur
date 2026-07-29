import os
from unittest.mock import patch

from pyspur.nodes.llm._model_info import LLMModels
from pyspur.nodes.llm._providers import setup_minimax_configuration


def test_minimax_model_registry_contains_target_models() -> None:
    m3 = LLMModels.get_model_info(LLMModels.MINIMAX_M3.value)
    m2_7 = LLMModels.get_model_info(LLMModels.MINIMAX_M2_7.value)

    assert m3 is not None
    assert m3.constraints.context_window == 1000000
    assert m3.constraints.input_modalities == {"text", "image", "video"}
    assert m3.constraints.thinking_modes == {"adaptive", "disabled"}
    assert m3.constraints.pricing_usd_per_million_tokens["cache_read"] == 0.12
    assert m3.constraints.pricing_usd_per_million_tokens["input"] == 0.6
    assert m3.constraints.pricing_usd_per_million_tokens["output"] == 2.4
    assert len(m3.constraints.pricing_tiers_usd_per_million_tokens) == 4

    assert m2_7 is not None
    assert m2_7.constraints.context_window == 204800
    assert m2_7.constraints.input_modalities == {"text"}
    assert m2_7.constraints.thinking_modes == {"always_on"}
    assert m2_7.constraints.pricing_usd_per_million_tokens["cache_write"] == 0.375


def test_minimax_configuration_resolves_all_regions_and_protocols() -> None:
    environment = {
        "MINIMAX_GLOBAL_EN_OPENAI_API_BASE": "https://api.minimax.io/v1",
        "MINIMAX_GLOBAL_EN_ANTHROPIC_API_BASE": "https://api.minimax.io/anthropic",
        "MINIMAX_CN_ZH_OPENAI_API_BASE": "https://api.minimaxi.com/v1",
        "MINIMAX_CN_ZH_ANTHROPIC_API_BASE": "https://api.minimaxi.com/anthropic",
    }
    cases = [
        ("global_en", "openai", "https://api.minimax.io/v1"),
        ("global_en", "anthropic", "https://api.minimax.io/anthropic"),
        ("cn_zh", "openai", "https://api.minimaxi.com/v1"),
        ("cn_zh", "anthropic", "https://api.minimaxi.com/anthropic"),
    ]

    for region, protocol, api_base in cases:
        with patch.dict(
            os.environ,
            {**environment, "MINIMAX_REGION": region, "MINIMAX_PROTOCOL": protocol},
            clear=False,
        ):
            assert setup_minimax_configuration("minimax/MiniMax-M3") == {
                "model": "MiniMax-M3",
                "custom_llm_provider": protocol,
                "api_base": api_base,
            }


def test_minimax_anthropic_base_must_use_anthropic_root() -> None:
    with patch.dict(
        os.environ,
        {
            "MINIMAX_REGION": "global_en",
            "MINIMAX_PROTOCOL": "anthropic",
            "MINIMAX_GLOBAL_EN_ANTHROPIC_API_BASE": "https://api.minimax.io/v1",
        },
        clear=False,
    ):
        try:
            setup_minimax_configuration("minimax/MiniMax-M3")
        except ValueError as exc:
            assert "must end with /anthropic" in str(exc)
        else:
            raise AssertionError("Expected an invalid Anthropic base URL to be rejected")

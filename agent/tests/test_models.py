from decimal import Decimal
from typing import Any

import httpx
import pytest
import respx
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from lendloop_agent.config import Settings
from lendloop_agent.models.check import check_tool_calling
from lendloop_agent.models.factory import build_chat_model
from lendloop_agent.models.prices import price_for
from lendloop_agent.models.providers import ModelSpec, ModelSpecError, list_models
from lendloop_agent.models.usage import UsageRecorder

from .conftest import ISSUER


def _settings(**keys: Any) -> Settings:
    return Settings.model_validate(
        {"database_url": "postgresql://unused", "jwt_issuer": ISSUER, **keys}
    )


class TestModelSpec:
    def test_splits_on_the_first_colon_only(self) -> None:
        assert ModelSpec.parse("ollama:qwen3:4b") == ModelSpec("ollama", "qwen3:4b")
        assert str(ModelSpec.parse("anthropic:claude-haiku-5-5")) == "anthropic:claude-haiku-5-5"

    @pytest.mark.parametrize("text", ["qwen3", "unknown:model", "anthropic:", ""])
    def test_rejects_malformed_or_unknown_providers(self, text: str) -> None:
        with pytest.raises(ModelSpecError):
            ModelSpec.parse(text)


class TestPrices:
    def test_listed_models_have_a_price_and_cost_is_per_million_tokens(self) -> None:
        price = price_for("anthropic", "claude-haiku-5-5")
        assert price is not None
        # 2,000 in at $0.10/M plus 500 out at $0.50/M
        assert price.cost(2_000, 500) == Decimal("0.00045")

    def test_local_models_are_free_and_unknown_models_have_no_price(self) -> None:
        local = price_for("ollama", "anything:3b")
        assert local is not None
        assert local.cost(10_000, 10_000) == 0
        assert price_for("openai", "some-new-model") is None


class TestFactory:
    def test_cloud_providers_need_their_key(self) -> None:
        with pytest.raises(ModelSpecError, match="no API key"):
            build_chat_model(_settings(), ModelSpec("anthropic", "claude-haiku-5-5"))

    def test_builds_the_provider_class_from_configuration(self) -> None:
        settings = _settings(ANTHROPIC_API_KEY="sk-test", OLLAMA_BASE_URL="http://x:1")
        claude = build_chat_model(settings, ModelSpec("anthropic", "claude-haiku-5-5"))
        local = build_chat_model(settings, ModelSpec("ollama", "qwen3:4b"))
        assert type(claude).__name__ == "ChatAnthropic"
        assert type(local).__name__ == "ChatOllama"
        assert getattr(local, "base_url", None) == "http://x:1"


class TestListModels:
    @respx.mock
    def test_reads_each_providers_own_model_list(self) -> None:
        settings = _settings(
            ANTHROPIC_API_KEY="a",
            OPENAI_API_KEY="o",
            GOOGLE_API_KEY="g",
            OLLAMA_BASE_URL="http://ol",
        )
        respx.get("https://api.anthropic.com/v1/models").respond(
            json={"data": [{"id": "claude-haiku-5-5"}]}
        )
        respx.get("https://api.openai.com/v1/models").respond(
            json={"data": [{"id": "gpt-5.4-mini"}, {"id": "text-embedding-3-small"}]}
        )
        respx.get("https://generativelanguage.googleapis.com/v1beta/models").respond(
            json={
                "models": [
                    {
                        "name": "models/gemini-2.5-flash-lite",
                        "supportedGenerationMethods": ["generateContent"],
                    },
                    {
                        "name": "models/embedding-001",
                        "supportedGenerationMethods": ["embedContent"],
                    },
                ]
            }
        )
        respx.get("http://ol/api/tags").respond(json={"models": [{"name": "qwen3:4b"}]})
        with httpx.Client() as client:
            assert list_models(settings, "anthropic", client) == ["claude-haiku-5-5"]
            assert list_models(settings, "openai", client) == ["gpt-5.4-mini"]
            assert list_models(settings, "google_genai", client) == ["gemini-2.5-flash-lite"]
            assert list_models(settings, "ollama", client) == ["qwen3:4b"]


class _ScriptedModel(BaseChatModel):
    """A stand-in model that always gives the same reply, with token usage."""

    reply: AIMessage

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **_: Any) -> "_ScriptedModel":  # pyright: ignore[reportIncompatibleMethodOverride]
        return self

    def _generate(
        self, messages: list[BaseMessage], stop: Any = None, run_manager: Any = None, **_: Any
    ) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self.reply)])


def _tool_reply(args: dict[str, str]) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"name": "CheckAvailability", "args": args, "id": "1", "type": "tool_call"}],
        usage_metadata={"input_tokens": 120, "output_tokens": 30, "total_tokens": 150},
    )


class TestToolCallingCheck:
    def _check(self, reply: AIMessage) -> tuple[bool, UsageRecorder]:
        spec = ModelSpec("anthropic", "claude-haiku-5-5")
        recorder = UsageRecorder(actor="system:test", role="main", spec=spec)
        result = check_tool_calling(_ScriptedModel(reply=reply), recorder)
        return result.passed, recorder

    def test_passes_a_correct_tool_call_and_records_its_cost(self) -> None:
        passed, recorder = self._check(
            _tool_reply({"tool_name": "extension ladder", "date": "2026-11-21"})
        )
        assert passed
        [record] = recorder.records
        assert (record.input_tokens, record.output_tokens) == (120, 30)
        assert record.cost_usd == Decimal("0.000027")  # 120 x 0.10/M + 30 x 0.50/M
        assert record.model == "anthropic:claude-haiku-5-5"

    @pytest.mark.parametrize(
        "reply",
        [
            AIMessage(content="Yes, it is free."),  # answered without the tool
            _tool_reply({"tool_name": "ladder", "date": "21/11/2026"}),  # wrong date format
            _tool_reply({"tool_name": "drill", "date": "2026-11-21"}),  # wrong tool name
        ],
        ids=["no-tool-call", "wrong-date", "wrong-tool-name"],
    )
    def test_fails_models_that_do_not_call_the_tool_correctly(self, reply: AIMessage) -> None:
        passed, _ = self._check(reply)
        assert not passed

    def test_an_unreachable_model_fails_with_a_reason_instead_of_crashing(self) -> None:
        spec = ModelSpec("ollama", "granite4:3b")
        recorder = UsageRecorder(actor="system:test", role="main", spec=spec)
        unreachable = build_chat_model(
            _settings(OLLAMA_BASE_URL="http://127.0.0.1:9"),
            spec,  # nothing listens on port 9
        )
        result = check_tool_calling(unreachable, recorder)
        assert not result.passed
        assert result.reason.startswith("Could not reach the model")

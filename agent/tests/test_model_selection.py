from decimal import Decimal

import psycopg

from lendloop_agent.config import Settings
from lendloop_agent.db import migrate
from lendloop_agent.models.providers import ModelSpec
from lendloop_agent.models.selection import choose_model, current_model
from lendloop_agent.models.usage import UsageRecord, save_usage

from .conftest import ISSUER


def test_env_default_until_a_model_is_chosen_then_the_choice_wins(database_url: str) -> None:
    migrate(database_url)
    settings = Settings(database_url=database_url, jwt_issuer=ISSUER, model="ollama:qwen3:4b")
    with psycopg.connect(database_url) as conn:
        conn.execute("DELETE FROM model_selection")
        assert current_model(conn, settings, "main") == ModelSpec("ollama", "qwen3:4b")
        assert current_model(conn, settings, "fast") is None

        choose_model(conn, "main", ModelSpec("anthropic", "claude-haiku-5-5"), "system:test")
        assert current_model(conn, settings, "main") == ModelSpec("anthropic", "claude-haiku-5-5")


def test_every_switch_is_in_the_audit_log(database_url: str) -> None:
    migrate(database_url)
    with psycopg.connect(database_url) as conn:
        conn.execute("DELETE FROM model_selection")
        choose_model(conn, "fast", ModelSpec("ollama", "qwen3:1.7b"), "system:test")
        choose_model(conn, "fast", ModelSpec("ollama", "qwen3:4b"), "system:test")
        row = conn.execute(
            "SELECT actor, details FROM audit_log WHERE action = 'model.switch'"
            " ORDER BY id DESC LIMIT 1"
        ).fetchone()
    assert row == (
        "system:test",
        {"role": "fast", "from": "ollama:qwen3:1.7b", "to": "ollama:qwen3:4b"},
    )


def test_usage_rows_keep_tokens_cost_and_time(database_url: str) -> None:
    migrate(database_url)
    record = UsageRecord(
        actor="system:test",
        role="main",
        model="anthropic:claude-haiku-5-5",
        input_tokens=120,
        output_tokens=30,
        cost_usd=Decimal("0.000027"),
        latency_ms=850,
        trace_id=None,
    )
    with psycopg.connect(database_url) as conn:
        save_usage(conn, [record])
        row = conn.execute(
            "SELECT input_tokens, output_tokens, cost_usd, latency_ms FROM model_usage"
            " ORDER BY id DESC LIMIT 1"
        ).fetchone()
    assert row == (120, 30, Decimal("0.00002700"), 850)

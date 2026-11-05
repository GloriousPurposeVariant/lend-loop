import time
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult

from lendloop_agent.models.prices import price_for
from lendloop_agent.models.providers import ModelSpec
from lendloop_agent.telemetry import current_trace_id


@dataclass
class UsageRecord:
    """One model call: who caused it, which model, tokens, cost and time."""

    actor: str
    role: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal | None  # None: prices.yaml has no price for this model
    latency_ms: int
    trace_id: str | None


@dataclass
class UsageRecorder(BaseCallbackHandler):
    """Passed to every model call as a LangChain callback. LangChain calls
    on_chat_model_start and on_llm_end around each call; this turns them into records."""

    actor: str
    role: str
    spec: ModelSpec
    records: list[UsageRecord] = field(default_factory=list)
    _started: dict[UUID, float] = field(default_factory=dict)

    def on_chat_model_start(
        self, serialized: Any, messages: Any, *, run_id: UUID, **_: Any
    ) -> None:
        self._started[run_id] = time.perf_counter()

    def on_llm_end(self, response: LLMResult, *, run_id: UUID, **_: Any) -> None:
        started = self._started.pop(run_id, time.perf_counter())
        generation = response.generations[0][0] if response.generations else None
        message = generation.message if isinstance(generation, ChatGeneration) else None
        usage = message.usage_metadata if isinstance(message, AIMessage) else None
        input_tokens = usage["input_tokens"] if usage else 0
        output_tokens = usage["output_tokens"] if usage else 0
        price = price_for(self.spec.provider, self.spec.model)
        self.records.append(
            UsageRecord(
                actor=self.actor,
                role=self.role,
                model=str(self.spec),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=price.cost(input_tokens, output_tokens) if price else None,
                latency_ms=round((time.perf_counter() - started) * 1000),
                trace_id=current_trace_id(),
            )
        )


def save_usage(conn: psycopg.Connection, records: list[UsageRecord]) -> None:
    with conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO model_usage (actor, role, model, input_tokens, output_tokens,"
            " cost_usd, latency_ms, trace_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            [
                (
                    r.actor,
                    r.role,
                    r.model,
                    r.input_tokens,
                    r.output_tokens,
                    r.cost_usd,
                    r.latency_ms,
                    r.trace_id,
                )
                for r in records
            ],
        )

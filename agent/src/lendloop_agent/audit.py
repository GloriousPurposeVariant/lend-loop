from typing import Any, Protocol

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from lendloop_agent.telemetry import current_trace_id


class AuditLog(Protocol):
    """Where the agent records what it did, for whom. Tests pass an in-memory one."""

    async def record(self, actor: str, action: str, details: dict[str, Any]) -> None: ...


class PostgresAuditLog:
    """Writes to audit_log in agent-db: insert-only, rows can never be changed or deleted.

    Each row keeps the current trace id, so it links to the full trace in Phoenix.
    """

    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def record(self, actor: str, action: str, details: dict[str, Any]) -> None:
        async with self._pool.connection() as conn:
            await conn.execute(
                "INSERT INTO audit_log (trace_id, actor, action, details) VALUES (%s, %s, %s, %s)",
                (current_trace_id(), actor, action, Jsonb(details)),
            )

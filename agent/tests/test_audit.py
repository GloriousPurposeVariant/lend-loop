import psycopg

from lendloop_agent.audit import PostgresAuditLog
from lendloop_agent.db import create_pool, migrate


async def test_records_actor_action_and_details(database_url: str) -> None:
    migrate(database_url)
    pool = create_pool(database_url)
    await pool.open(wait=True)
    try:
        details = {"tool": "my_requests", "args": {}, "outcome": "ok", "ms": 12}
        await PostgresAuditLog(pool).record("user:user_priya", "tool.call", details)
    finally:
        await pool.close()
    with psycopg.connect(database_url) as conn:
        row = conn.execute(
            "SELECT actor, action, details FROM audit_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
    assert row == ("user:user_priya", "tool.call", details)

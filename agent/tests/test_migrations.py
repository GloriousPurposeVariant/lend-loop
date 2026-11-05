from typing import LiteralString

import psycopg
import pytest

from lendloop_agent.db import migrate


def test_migrations_apply_once(database_url: str) -> None:
    migrate(database_url)
    assert migrate(database_url) == []  # a second run has nothing to do


@pytest.mark.parametrize(
    "statement",
    ["UPDATE audit_log SET action = 'x'", "DELETE FROM audit_log", "TRUNCATE audit_log"],
)
def test_audit_log_is_insert_only(database_url: str, statement: LiteralString) -> None:
    migrate(database_url)
    with psycopg.connect(database_url) as conn:
        conn.execute("INSERT INTO audit_log (actor, action) VALUES ('system', 'test')")
        with pytest.raises(psycopg.errors.RaiseException, match="insert-only"):
            conn.execute(statement)

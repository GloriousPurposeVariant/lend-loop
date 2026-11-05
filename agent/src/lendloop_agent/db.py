from pathlib import Path
from typing import LiteralString, cast

import psycopg
from psycopg_pool import AsyncConnectionPool

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
# Any fixed number: only one migration run may hold this lock at a time.
_MIGRATION_LOCK_ID = 727_001


def create_pool(database_url: str) -> AsyncConnectionPool:
    # Opened by the caller (the app's lifespan), so startup fails loudly if the
    # database is unreachable.
    return AsyncConnectionPool(database_url, min_size=1, max_size=10, open=False)


def migrate(database_url: str, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Applies every migrations/*.sql file not applied yet, in name order.

    Each file runs in its own transaction: it applies completely or not at all.
    Returns the names of the files applied by this run.
    """
    applied: list[str] = []
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (_MIGRATION_LOCK_ID,))
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                " version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
            )
            done = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
            for path in sorted(migrations_dir.glob("*.sql")):
                if path.name in done:
                    continue
                with conn.transaction():
                    # psycopg only accepts SQL written in the code, to stop SQL built from
                    # input. These files are ours, from the repo, so they are trusted.
                    sql = cast(LiteralString, path.read_text(encoding="utf-8"))
                    conn.execute(sql)
                    conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES (%s)", (path.name,)
                    )
                applied.append(path.name)
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (_MIGRATION_LOCK_ID,))
    return applied

import json
from typing import Literal

import psycopg

from lendloop_agent.config import Settings
from lendloop_agent.models.providers import ModelSpec
from lendloop_agent.telemetry import current_trace_id

Role = Literal["main", "fast"]
ROLES: tuple[Role, ...] = ("main", "fast")


def current_model(conn: psycopg.Connection, settings: Settings, role: Role) -> ModelSpec | None:
    """The model in use for a role: the one chosen with the CLI, else the .env default."""
    row = conn.execute("SELECT model FROM model_selection WHERE role = %s", (role,)).fetchone()
    if row:
        return ModelSpec.parse(row[0])
    default = settings.model if role == "main" else settings.fast_model
    return ModelSpec.parse(default) if default else None


def choose_model(conn: psycopg.Connection, role: Role, spec: ModelSpec, actor: str) -> None:
    """Switches a role to a model, and writes the change to the audit log."""
    with conn.transaction():
        previous = conn.execute(
            "SELECT model FROM model_selection WHERE role = %s", (role,)
        ).fetchone()
        conn.execute(
            "INSERT INTO model_selection (role, model, changed_by) VALUES (%s, %s, %s)"
            " ON CONFLICT (role) DO UPDATE"
            " SET model = EXCLUDED.model, changed_at = now(), changed_by = EXCLUDED.changed_by",
            (role, str(spec), actor),
        )
        conn.execute(
            "INSERT INTO audit_log (trace_id, actor, action, details)"
            " VALUES (%s, %s, 'model.switch', %s)",
            (
                current_trace_id(),
                actor,
                json.dumps(
                    {"role": role, "from": previous[0] if previous else None, "to": str(spec)}
                ),
            ),
        )

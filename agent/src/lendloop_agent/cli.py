import typer

from lendloop_agent.config import get_settings
from lendloop_agent.db import migrate as run_migrations

app = typer.Typer(help="LendLoop Assistant operator commands.", no_args_is_help=True)


@app.callback()
def main() -> None:
    """Operator commands for the agent service."""


@app.command()
def migrate() -> None:
    """Apply database migrations that have not been applied yet."""
    applied = run_migrations(get_settings().database_url)
    typer.echo(f"Applied: {', '.join(applied)}" if applied else "Database is up to date.")

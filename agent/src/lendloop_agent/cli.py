from enum import StrEnum
from typing import Annotated

import httpx
import psycopg
import typer

from lendloop_agent.config import get_settings
from lendloop_agent.db import migrate as run_migrations
from lendloop_agent.models.check import check_tool_calling
from lendloop_agent.models.factory import build_chat_model
from lendloop_agent.models.prices import price_for
from lendloop_agent.models.providers import (
    PROVIDERS,
    ModelSpec,
    ModelSpecError,
    is_configured,
    list_models,
)
from lendloop_agent.models.selection import ROLES, Role, choose_model, current_model
from lendloop_agent.models.usage import UsageRecorder, save_usage
from lendloop_agent.telemetry import configure_tracing, flush_tracing, get_tracer

app = typer.Typer(help="LendLoop Assistant operator commands.", no_args_is_help=True)
models_app = typer.Typer(help="Choose and check the language models.", no_args_is_help=True)
app.add_typer(models_app, name="models")

# Who changed things, in the audit log, when it was done from this command line.
CLI_ACTOR = "system:cli"


class RoleChoice(StrEnum):
    """Typer shows these as the allowed values of --role."""

    main = "main"
    fast = "fast"


@app.callback()
def main(ctx: typer.Context) -> None:
    """Operator commands for the agent service."""
    # Commands are traced like requests are, so a model check shows up in Phoenix too.
    if configure_tracing("agent-cli"):
        ctx.call_on_close(flush_tracing)


@app.command()
def migrate() -> None:
    """Apply database migrations that have not been applied yet."""
    applied = run_migrations(get_settings().database_url)
    typer.echo(f"Applied: {', '.join(applied)}" if applied else "Database is up to date.")


def _describe(spec: ModelSpec) -> str:
    price = price_for(spec.provider, spec.model)
    if price is None:
        return "no price (add it to prices.yaml)"
    cost = (
        "free"
        if price.input == price.output == 0
        else f"${price.input} in / ${price.output} out per 1M tokens"
    )
    return f"{cost}{f'  [{price.badge}]' if price.badge else ''}"


@models_app.command("list")
def list_command() -> None:
    """Every model you can use right now, with its price, read live from each provider."""
    settings = get_settings()
    with httpx.Client() as client:
        for name, provider in PROVIDERS.items():
            if not is_configured(settings, name):
                typer.echo(f"\n{provider.label}: not set up (no API key in .env)")
                continue
            try:
                models = list_models(settings, name, client)
            except httpx.HTTPError as error:
                typer.echo(f"\n{provider.label}: unreachable ({type(error).__name__})")
                continue
            typer.echo(f"\n{provider.label}: {len(models)} models")
            for model in models:
                spec = ModelSpec(name, model)
                typer.echo(f"  {spec}  {_describe(spec)}")
    current_command()


@models_app.command("current")
def current_command() -> None:
    """The model each role uses now."""
    settings = get_settings()
    with psycopg.connect(settings.database_url) as conn:
        typer.echo("")
        for role in ROLES:
            spec = current_model(conn, settings, role)
            typer.echo(f"{role}: {spec or 'none chosen'}")


def _run_check(spec: ModelSpec, role: Role) -> bool:
    settings = get_settings()
    recorder = UsageRecorder(actor=CLI_ACTOR, role=role, spec=spec)
    typer.echo(f"Checking {spec} can call tools...")
    attributes = {"lendloop.model": str(spec), "lendloop.role": role}
    with get_tracer().start_as_current_span("models.check", attributes=attributes):
        result = check_tool_calling(build_chat_model(settings, spec), recorder)
    with psycopg.connect(settings.database_url) as conn:
        save_usage(conn, recorder.records)
    for record in recorder.records:
        cost = "no price" if record.cost_usd is None else f"${record.cost_usd:.6f}"
        typer.echo(
            f"  {record.input_tokens} in / {record.output_tokens} out tokens,"
            f" {cost}, {record.latency_ms / 1000:.1f} s"
        )
    typer.echo(("  PASS: " if result.passed else "  FAIL: ") + result.reason)
    if not result.passed and spec.provider == "ollama" and result.reason.startswith("Could not"):
        typer.echo("  Is Ollama running? `npm run agent:local-model` starts it.")
    return result.passed


@models_app.command("check")
def check_command(
    model: Annotated[
        str | None, typer.Argument(help='"provider:model"; default: the main model')
    ] = None,
) -> None:
    """Prove a model can call tools, with one real request (recorded with its cost)."""
    settings = get_settings()
    try:
        if model:
            spec = ModelSpec.parse(model)
        else:
            with psycopg.connect(settings.database_url) as conn:
                spec = current_model(conn, settings, "main")
            if spec is None:
                raise ModelSpecError("No main model chosen yet. Run: lendloop-agent models use ...")
        passed = _run_check(spec, "main")
    except ModelSpecError as error:
        typer.echo(str(error), err=True)
        raise typer.Exit(1) from error
    raise typer.Exit(0 if passed else 1)


@models_app.command("use")
def use_command(
    model: Annotated[str, typer.Argument(help='"provider:model", e.g. ollama:qwen3:4b')],
    role_choice: Annotated[RoleChoice, typer.Option("--role")] = RoleChoice.main,
    skip_check: Annotated[bool, typer.Option(help="Switch without the tool-calling check")] = False,
) -> None:
    """Switch a role to a model. Takes effect on the next request: no restart."""
    settings = get_settings()
    role: Role = role_choice.value
    try:
        spec = ModelSpec.parse(model)
        if not is_configured(settings, spec.provider):
            raise ModelSpecError(f"{spec.provider} has no API key. Add it to .env first.")
        with httpx.Client() as client:
            available = list_models(settings, spec.provider, client)
        if spec.model not in available:
            hint = (
                " Download it first (npm run agent:local-model)."
                if spec.provider == "ollama"
                else ""
            )
            raise ModelSpecError(f"{spec.provider} has no model {spec.model!r}.{hint}")
        if not skip_check and not _run_check(spec, role):
            raise ModelSpecError("Not switched: the model failed the tool-calling check.")
    except (ModelSpecError, httpx.HTTPError) as error:
        typer.echo(str(error), err=True)
        raise typer.Exit(1) from error
    with (
        get_tracer().start_as_current_span("models.use", attributes={"lendloop.model": str(spec)}),
        psycopg.connect(settings.database_url) as conn,
    ):
        choose_model(conn, role, spec, CLI_ACTOR)
    typer.echo(f"{role} model is now {spec}.")

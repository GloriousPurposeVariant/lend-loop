import os

from openinference.instrumentation.langchain import LangChainInstrumentor
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Phoenix groups traces by this project name.
PROJECT_NAME = "lendloop-agent"


def configure_tracing(service: str) -> bool:
    """Sends spans to the OpenTelemetry endpoint in OTEL_EXPORTER_OTLP_ENDPOINT (Phoenix).

    Returns False, and traces nothing, when no endpoint is set: tests and one-off
    commands then run without a tracing backend.
    """
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return False
    provider = TracerProvider(
        resource=Resource.create(
            {"service.name": service, "openinference.project.name": PROJECT_NAME}
        )
    )
    # Batches spans in the background, so tracing never slows a request down.
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    # Every LangChain model and tool call becomes a span: prompt, reply, tool calls,
    # token counts and time, in the OpenInference format Phoenix understands.
    LangChainInstrumentor().instrument(tracer_provider=provider)
    return True


def get_tracer() -> trace.Tracer:
    return trace.get_tracer("lendloop_agent")


def current_trace_id() -> str | None:
    """The trace this code runs in, as Phoenix shows it, or None outside any trace."""
    context = trace.get_current_span().get_span_context()
    return format(context.trace_id, "032x") if context.is_valid else None


def flush_tracing() -> None:
    """Sends spans still waiting in the batch. Short-lived processes (the CLI) call this
    before exiting, or their last spans would be lost."""
    provider = trace.get_tracer_provider()
    if isinstance(provider, TracerProvider):
        provider.force_flush()

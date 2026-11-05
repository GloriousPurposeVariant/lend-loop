import logging
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog
from opentelemetry import trace

# Never written to a log, whatever a caller passes in.
_SECRET_KEYS = {"authorization", "token", "api_key", "password", "secret", "cookie"}


def _redact(_: Any, __: str, event: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    for key in event:
        if key.lower() in _SECRET_KEYS:
            event[key] = "[redacted]"
    return event


def _add_trace_ids(_: Any, __: str, event: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    """Adds the current trace and span ids, so a log line can be found in Phoenix."""
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        event["trace_id"] = format(context.trace_id, "032x")
        event["span_id"] = format(context.span_id, "016x")
    return event


def configure_logging(level: str, service: str) -> None:
    """One JSON object per line on stdout: easy to read in `docker compose logs`, easy to ship."""
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level.upper())
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _add_trace_ids,
            _redact,
            structlog.processors.EventRenamer("message"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level.upper())),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    structlog.contextvars.bind_contextvars(service=service)


def get_logger() -> structlog.stdlib.BoundLogger:
    return structlog.get_logger()

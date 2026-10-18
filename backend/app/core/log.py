"""Logging setup: one line per record to stdout, JSON in production, text for local work.

Every record carries the request id and, once authenticated, the user id of the request
it belongs to, so all lines of one request can be found by a single id. Secrets never go
into logs: no passwords, tokens or Authorization headers, no emails, and the calendar feed
token in URLs is masked.
"""

import json
import logging
import logging.config
import re
import socket
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, Literal

from app.core.sage_logging import build_sage_handler

# One mutable dict per request. Sync dependencies and endpoints run in worker threads
# with a copy of the context; the copy points to the same dict, so a user id set during
# authentication is visible to every later log line of the request.
_request_context: ContextVar[dict[str, Any] | None] = ContextVar("request_context", default=None)

# Attributes every LogRecord has; anything else was passed through `extra=`.
# uvicorn adds color_message, an ANSI-colored copy of the message.
_STANDARD_ATTRIBUTES = set(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) | {"message", "asctime", "request_id", "user_id", "color_message"}

# Access lines already say "METHOD path status" in the message; text output skips repeats.
_ACCESS_MESSAGE_FIELDS = {"method", "path", "status"}

_FEED_TOKEN = re.compile(r"(/calendar/feed/)[^/]+?(\.ics)")


def start_request_context(request_id: str) -> dict[str, Any]:
    context = {"request_id": request_id, "user_id": None}
    _request_context.set(context)
    return context


def bind_user(user_id: int) -> None:
    """Attach the authenticated user to the current request's log lines."""
    context = _request_context.get()
    if context is not None:
        context["user_id"] = user_id


def annotate_request(**fields: Any) -> None:
    """Add fields to the current request's access line (e.g. why it failed)."""
    context = _request_context.get()
    if context is not None:
        context.update({key: value for key, value in fields.items() if value is not None})


def mask_path(path: str) -> str:
    """Hide secrets that travel in URL paths (the calendar subscription token)."""
    return _FEED_TOKEN.sub(r"\1***\2", path)


def _install_record_factory() -> None:
    """Stamp every record with the request context when it is created, so any handler
    (stdout, test capture, a future shipper) sees request_id and user_id."""
    current = logging.getLogRecordFactory()
    if getattr(current, "_with_request_context", False):
        return

    def factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = current(*args, **kwargs)
        context = _request_context.get() or {}
        record.request_id = context.get("request_id")
        record.user_id = context.get("user_id")
        return record

    factory._with_request_context = True  # type: ignore[attr-defined]
    logging.setLogRecordFactory(factory)


def _extra_fields(record: logging.LogRecord) -> dict[str, Any]:
    return {
        key: value
        for key, value in record.__dict__.items()
        if key not in _STANDARD_ATTRIBUTES and not key.startswith("_")
    }


# Sage rejects `WARNING`: its accepted level set is ERROR, DEBUG, CRITICAL, FATAL,
# EMERGENCY, INFO, IMPORTANT, WARN, TRACE. Everything else already matches.
_SAGE_LEVELS = {"WARNING": "WARN"}


class JsonFormatter(logging.Formatter):
    def entry(self, record: logging.LogRecord) -> dict[str, Any]:
        entry: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in ("request_id", "user_id"):
            if getattr(record, key, None) is not None:
                entry[key] = getattr(record, key)
        entry.update(_extra_fields(record))
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return entry

    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(self.entry(record), ensure_ascii=False, default=str)


class SageJsonFormatter(JsonFormatter):
    """Sage-compatible JSON.

    Sage validates every record and requires the fields ``env``, ``system`` and
    ``inst`` plus an ``@timestamp`` no more than a minute in the future; records
    that fail validation land in the ``dead-letters`` index. It also spells the
    warning level ``WARN``.
    """

    def __init__(self, env: str, system: str, inst: str) -> None:
        super().__init__()
        self._required = {"env": env, "system": system, "inst": inst}

    def entry(self, record: logging.LogRecord) -> dict[str, Any]:
        entry = super().entry(record)
        entry.pop("ts", None)
        entry["@timestamp"] = datetime.fromtimestamp(record.created, UTC).isoformat(
            timespec="milliseconds"
        )
        entry["level"] = _SAGE_LEVELS.get(record.levelname, record.levelname)
        # Sage requires these on every record; keep them first for readability.
        return {**self._required, **entry}


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        stamp = datetime.fromtimestamp(record.created).strftime("%H:%M:%S.%f")[:-3]
        parts = [stamp, f"{record.levelname:<7}", record.name]
        if getattr(record, "request_id", None):
            parts.append(f"[{record.request_id}]")
        line = " ".join(parts) + " " + record.getMessage()
        extra = _extra_fields(record)
        if record.name == "app.access":
            extra = {key: value for key, value in extra.items() if key not in _ACCESS_MESSAGE_FIELDS}
        if getattr(record, "user_id", None) is not None:
            extra = {"user_id": record.user_id, **extra}
        if extra:
            line += " " + " ".join(f"{key}={value}" for key, value in extra.items())
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def configure_logging(
    level: str = "INFO",
    fmt: Literal["json", "text"] = "json",
    sage_url: str | None = None,
    sage_token: str | None = None,
    sage_timeout: float = 5.0,
    sage_env: str = "prod",
    sage_system: str = "petcare",
    sage_inst: str | None = None,
) -> None:
    _install_record_factory()
    formatter = JsonFormatter if fmt == "json" else TextFormatter
    handlers: dict[str, object] = {
        "stdout": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "default",
        }
    }
    sage_handler = build_sage_handler(
        sage_url,
        sage_token,
        sage_timeout,
        SageJsonFormatter(sage_env, sage_system, sage_inst or socket.gethostname()),
    )
    if sage_handler is not None:
        handlers["sage"] = {
            "()": lambda: sage_handler,
        }

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {"default": {"()": formatter}},
            "handlers": handlers,
            "root": {
                "level": level.upper(),
                "handlers": ["stdout"] + (["sage"] if sage_handler is not None else []),
            },
            "loggers": {
                # Server messages go through the same handler and format.
                "uvicorn": {"handlers": [], "propagate": True},
                "uvicorn.error": {"handlers": [], "propagate": True},
                # Replaced by our own access line with timing, user and request id.
                "uvicorn.access": {"handlers": [], "propagate": False, "level": "WARNING"},
                # Database drivers log SQL with bound parameters (emails, names) at DEBUG,
                # so they stay at WARNING even when LOG_LEVEL=DEBUG.
                "sqlalchemy.engine": {"level": "WARNING"},
                "psycopg": {"level": "WARNING"},
                "aiosqlite": {"level": "WARNING"},
                # The AI client's HTTP calls; the analyzer logs its own line with timing.
                "httpx": {"level": "WARNING"},
                "httpcore": {"level": "WARNING"},
            },
        }
    )

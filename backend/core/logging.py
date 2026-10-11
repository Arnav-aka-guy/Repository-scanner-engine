"""Structured logging configuration for the Antigravity Engine backend.

Provides a centralized logging setup with structured JSON output,
request ID tracking, and consistent formatting across all modules.
"""

from __future__ import annotations

import logging
import sys
import uuid
from contextvars import ContextVar

# Context variable for request ID tracking across async boundaries
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Inject the current request ID into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Attach request_id to the log record."""
        record.request_id = request_id_var.get("-")  # type: ignore[attr-defined]
        return True


class JsonFormatter(logging.Formatter):
    """Format log records as single-line JSON objects for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        import datetime

        log_obj = {
            "timestamp": datetime.datetime.fromtimestamp(record.created, tz=datetime.UTC).isoformat(),
            "level": record.levelname,
            "request_id": getattr(record, "request_id", "-"),
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        import json

        return json.dumps(log_obj)


def generate_request_id() -> str:
    """Generate a short, unique request ID."""
    return uuid.uuid4().hex[:12]


def setup_logging(level: str = "INFO", format_type: str = "text") -> None:
    """Configure application-wide structured logging.

    Args:
        level: Logging level string (DEBUG, INFO, WARNING, ERROR).
        format_type: "text" (human-readable) or "json" (structured).
    """
    log_format = "%(asctime)s | %(levelname)-8s | %(request_id)s | %(name)-30s | %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    import contextlib

    if hasattr(sys.stdout, "reconfigure"):
        with contextlib.suppress(Exception):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        with contextlib.suppress(Exception):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    # Create formatter
    import os

    effective_format = os.getenv("LOG_FORMAT", format_type).lower()
    if effective_format == "json":
        formatter: logging.Formatter = JsonFormatter()
    else:
        formatter = logging.Formatter(fmt=log_format, datefmt=date_format)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Clear existing handlers
    root_logger.handlers.clear()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(RequestIdFilter())
    root_logger.addHandler(console_handler)

    # Suppress noisy third-party loggers
    for noisy_logger in (
        "uvicorn.access",
        "uvicorn.error",
        "httpcore",
        "httpx",
        "sentence_transformers",
        "transformers",
        "filelock",
        "urllib3",
    ):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    logging.getLogger("backend").info("Structured logging initialised (level=%s)", level)

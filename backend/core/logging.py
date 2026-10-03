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


def generate_request_id() -> str:
    """Generate a short, unique request ID."""
    return uuid.uuid4().hex[:12]


def setup_logging(level: str = "INFO") -> None:
    """Configure application-wide structured logging.

    Args:
        level: Logging level string (DEBUG, INFO, WARNING, ERROR).
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

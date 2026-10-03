"""Custom exceptions for LLM providers."""

from __future__ import annotations


class ProviderHTTPError(RuntimeError):
    """Exception raised when an LLM provider returns an HTTP error.

    Attributes:
        status_code: The HTTP response status code (e.g. 404, 413, 429).
        message: The parsed error message.
        error_code: Provider-specific error code string (e.g. 'model_not_found', 'rate_limit_exceeded').
    """

    def __init__(
        self,
        status_code: int,
        message: str,
        error_code: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.error_code = error_code
        super().__init__(f"API Error ({status_code}): {message}")

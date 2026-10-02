"""Request logging middleware with request ID tracking and timing."""

from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from backend.core.logging import generate_request_id, request_id_var

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with timing, status, and a unique request ID.

    Attaches an ``X-Request-ID`` header to both the request context and
    the response so that logs can be correlated across services.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Process the request, log it, and return the response."""
        rid = request.headers.get("X-Request-ID") or generate_request_id()
        token = request_id_var.set(rid)

        start = time.perf_counter()
        method = request.method
        path = request.url.path

        # Skip noisy health checks from log
        is_health = path in ("/", "/health")

        if not is_health:
            logger.info("--> %s %s", method, path)

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.exception("[ERROR] %s %s — unhandled exception (%.1fms)", method, path, duration_ms)
            raise
        finally:
            request_id_var.reset(token)

        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = rid
        response.headers["X-Response-Time"] = f"{duration_ms:.1f}ms"

        if not is_health:
            log_fn = logger.info if response.status_code < 400 else logger.warning
            log_fn(
                "<-- %s %s — %d (%.1fms)",
                method,
                path,
                response.status_code,
                duration_ms,
            )

        return response

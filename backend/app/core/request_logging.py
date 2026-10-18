"""One access line per request (method, route, status, duration, user, request id) and the
reason of 4xx answers, so a failed request can be understood from a single line."""

import logging
import re
import time
from uuid import uuid4

from fastapi import FastAPI, Request, Response, status
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.log import annotate_request, mask_path, start_request_context

REQUEST_ID_HEADER = "X-Request-ID"
# Accept a caller's id (e.g. from the frontend proxy) only if it is short and plain.
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")
# Health checks run every few seconds; keep them out of INFO.
QUIET_PATHS = {"/api/v1/health"}
# Already on every record via the log record factory.
CONTEXT_KEYS = {"request_id", "user_id"}

access_logger = logging.getLogger("app.access")
error_logger = logging.getLogger("app.errors")


def _request_id(request: Request) -> str:
    incoming = request.headers.get(REQUEST_ID_HEADER, "")
    return incoming if _VALID_REQUEST_ID.fullmatch(incoming) else uuid4().hex[:16]


def _access_level(path: str, status_code: int) -> int:
    if status_code >= 500:
        return logging.ERROR
    if status_code >= 400:
        return logging.WARNING
    return logging.DEBUG if path in QUIET_PATHS else logging.INFO


def register_request_logging(app: FastAPI) -> None:
    @app.middleware("http")
    async def log_request(request: Request, call_next) -> Response:
        request_id = _request_id(request)
        context = start_request_context(request_id)
        started = time.perf_counter()
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        try:
            response = await call_next(request)
            status_code = response.status_code
        finally:
            path = mask_path(request.url.path)
            route = request.scope.get("route")
            fields = {
                "method": request.method,
                "path": path,
                "route": getattr(route, "path", None),
                "status": status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
            }
            # Whatever handlers added with annotate_request (error reason, counts, ...).
            fields.update(
                (key, value) for key, value in context.items() if key not in CONTEXT_KEYS
            )
            access_logger.log(
                _access_level(request.url.path, status_code),
                "%s %s %s",
                request.method,
                path,
                status_code,
                extra=fields,
            )
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    @app.exception_handler(StarletteHTTPException)
    async def remember_http_error(request: Request, exc: StarletteHTTPException) -> Response:
        # The access line reports it; the detail explains why (e.g. "Pet not found").
        annotate_request(error=exc.detail if isinstance(exc.detail, str) else None)
        return await http_exception_handler(request, exc)

    @app.exception_handler(RequestValidationError)
    async def remember_validation_error(request: Request, exc: RequestValidationError) -> Response:
        # Field locations only: input values may hold passwords or personal data.
        fields = sorted({".".join(str(part) for part in error["loc"]) for error in exc.errors()})
        annotate_request(error="validation failed", invalid_fields=fields)
        return await request_validation_exception_handler(request, exc)

    @app.exception_handler(Exception)
    async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        error_logger.error(
            "Unhandled %s while processing %s %s",
            type(exc).__name__,
            request.method,
            mask_path(request.url.path),
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )


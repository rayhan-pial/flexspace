"""Common error envelope: {"error": {"code", "message", "details"}} (docs/architecture.md section 8)."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_HTTP_CODES = {
    401: "unauthenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed",
    413: "payload_too_large", 415: "unsupported_media_type", 422: "validation_error",
}


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def error_response(status_code: int, code: str, message: str, details: dict[str, Any] | None = None) -> JSONResponse:
    body = {"error": {"code": code, "message": message, "details": details or {}}}
    return JSONResponse(body, status_code=status_code)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError):
        return error_response(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError):
        # Report location/message/type only: FastAPI's default echoes the submitted input,
        # which here could be a password.
        errors = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
        return error_response(422, "validation_error", "The request is not valid.", {"errors": errors})

    @app.exception_handler(StarletteHTTPException)
    async def _http(_request: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "http_error")
        return error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unexpected(_request: Request, _exc: Exception):
        return error_response(500, "internal_error", "Something went wrong.")

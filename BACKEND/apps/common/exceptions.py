"""Custom exceptions and DRF exception handler."""

from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler


class BusinessLogicError(Exception):
    """Raised when a business rule is violated."""

    def __init__(self, message: str, code: str = "BUSINESS_LOGIC_ERROR") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Return API errors using the standard error envelope."""
    response = exception_handler(exc, context)
    if response is not None:
        detail = _normalize_detail(response.data)
        code = getattr(exc, "default_code", None) or "ERROR"
        if isinstance(exc, APIException):
            code = getattr(exc, "default_code", str(exc.detail))
        status_code = response.status_code
        mapped = _http_status_to_code(status_code)
        body = {
            "status": "error",
            "message": detail.get("_message", "Request failed"),
            "errors": detail.get("fields", {}),
            "code": mapped,
        }
        return Response(body, status=status_code)

    if isinstance(exc, Http404):
        return Response(
            {
                "status": "error",
                "message": "Not found.",
                "errors": {},
                "code": "NOT_FOUND",
            },
            status=status.HTTP_404_NOT_FOUND,
        )
    if isinstance(exc, DjangoPermissionDenied):
        return Response(
            {
                "status": "error",
                "message": str(exc) or "Permission denied.",
                "errors": {},
                "code": "PERMISSION_DENIED",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _normalize_detail(data: Any) -> dict[str, Any]:
    """Build a flat message and field errors from DRF error payloads."""
    if isinstance(data, dict):
        if "detail" in data and len(data) == 1:
            return {"_message": str(data["detail"]), "fields": {}}
        fields: dict[str, list[str]] = {}
        message_parts: list[str] = []
        for key, val in data.items():
            if key == "detail":
                message_parts.append(str(val))
                continue
            if isinstance(val, list):
                fields[key] = [str(x) for x in val]
            else:
                fields[key] = [str(val)]
        msg = "; ".join(message_parts) if message_parts else "Validation error."
        return {"_message": msg, "fields": fields}
    if isinstance(data, list):
        return {"_message": "; ".join(str(x) for x in data), "fields": {}}
    return {"_message": str(data), "fields": {}}


def _http_status_to_code(http_status: int) -> str:
    mapping = {
        400: "VALIDATION_ERROR",
        401: "AUTHENTICATION_ERROR",
        403: "PERMISSION_DENIED",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "RATE_LIMITED",
        503: "SERVICE_UNAVAILABLE",
    }
    return mapping.get(http_status, "INTERNAL_ERROR" if http_status >= 500 else "ERROR")

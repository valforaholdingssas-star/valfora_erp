"""CORS handling for the public lead ingest endpoint."""

from __future__ import annotations

from django.http import HttpResponse

from apps.crm.lead_ingest_auth import get_allowed_ingest_origins, is_origin_allowed, normalize_origin

INGEST_PATH_SUFFIX = "/crm/leads/ingest"
ALLOW_HEADERS = "Content-Type, X-Lead-Ingest-Key, Authorization"
ALLOW_METHODS = "POST, OPTIONS"


def _is_ingest_request(request) -> bool:  # noqa: ANN001
    path = (getattr(request, "path", "") or getattr(request, "path_info", "") or "").rstrip("/")
    return path.endswith(INGEST_PATH_SUFFIX)


def _apply_cors_headers(response, origin: str) -> None:
    response["Access-Control-Allow-Origin"] = origin
    response["Access-Control-Allow-Methods"] = ALLOW_METHODS
    response["Access-Control-Allow-Headers"] = ALLOW_HEADERS
    response["Access-Control-Max-Age"] = "86400"
    response["Vary"] = "Origin"


class LeadIngestCorsMiddleware:
    """Apply CORS headers for browser form posts to the lead ingest API."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not _is_ingest_request(request):
            return self.get_response(request)

        raw_origin = (request.headers.get("Origin") or "").strip()
        normalized_origin = normalize_origin(raw_origin) if raw_origin else ""
        allowed_origins = get_allowed_ingest_origins()

        if request.method == "OPTIONS":
            response = HttpResponse(status=204)
            if normalized_origin and normalized_origin in allowed_origins:
                _apply_cors_headers(response, raw_origin)
            return response

        response = self.get_response(request)
        if normalized_origin and is_origin_allowed(request):
            _apply_cors_headers(response, raw_origin)
        return response

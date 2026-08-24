"""Authentication helpers for the public lead ingest endpoint."""

from __future__ import annotations

import hmac
import os

from rest_framework.permissions import BasePermission

from apps.crm.lead_engine import LeadEngine
from apps.crm.models import LeadEngineConfig


def resolve_lead_ingest_api_key(config: LeadEngineConfig | None = None) -> str:
    """Resolve API key from DB config first, then environment fallback."""

    cfg = config or LeadEngine.get_active_config()
    db_key = (getattr(cfg, "public_ingest_api_key", None) or "").strip()
    if db_key:
        return db_key
    return os.getenv("CRM_LEAD_INGEST_API_KEY", "").strip()


def extract_lead_ingest_api_key(request) -> str:  # noqa: ANN001
    """Read API key from X-Lead-Ingest-Key or Authorization Bearer header."""

    header_key = (request.headers.get("X-Lead-Ingest-Key") or "").strip()
    if header_key:
        return header_key
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


class LeadIngestApiKeyPermission(BasePermission):
    """Allow requests that present a valid lead ingest API key."""

    message = "API key de ingestión de leads inválida o deshabilitada."

    def has_permission(self, request, view) -> bool:  # noqa: ANN001
        config = LeadEngine.get_active_config()
        if not config.public_ingest_enabled:
            return False
        expected = resolve_lead_ingest_api_key(config)
        if not expected:
            return False
        provided = extract_lead_ingest_api_key(request)
        if not provided:
            return False
        return hmac.compare_digest(provided, expected)

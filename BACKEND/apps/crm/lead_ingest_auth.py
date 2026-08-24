"""Authentication helpers for the public lead ingest endpoint."""

from __future__ import annotations

import hmac
import os
from urllib.parse import urlparse

from rest_framework.permissions import BasePermission

from apps.crm.lead_engine import LeadEngine
from apps.crm.models import LeadEngineConfig

DEFAULT_INGEST_ORIGINS = (
    "https://3orillas.com",
    "https://www.3orillas.com",
)


def normalize_origin(value: str) -> str:
    """Normalize origin/referer base URL for whitelist comparison."""

    cleaned = (value or "").strip().rstrip("/")
    if not cleaned:
        return ""
    if "://" not in cleaned:
        cleaned = f"https://{cleaned}"
    parsed = urlparse(cleaned)
    if not parsed.scheme or not parsed.netloc:
        return cleaned.lower()
    return f"{parsed.scheme}://{parsed.netloc}".lower()


def get_allowed_ingest_origins(config: LeadEngineConfig | None = None) -> list[str]:
    """Resolve allowed browser origins for lead ingest."""

    configured: list[str] = []
    if config is not None:
        configured = [normalize_origin(item) for item in (config.public_ingest_allowed_origins or []) if item]
    else:
        try:
            cfg = LeadEngine.get_active_config()
            configured = [normalize_origin(item) for item in (cfg.public_ingest_allowed_origins or []) if item]
        except Exception:
            configured = []
    env_raw = os.getenv("CRM_LEAD_INGEST_ALLOWED_ORIGINS", "")
    env_origins = [normalize_origin(item) for item in env_raw.split(",") if item.strip()]
    combined = configured or env_origins or [normalize_origin(item) for item in DEFAULT_INGEST_ORIGINS]
    seen: set[str] = set()
    unique: list[str] = []
    for origin in combined:
        if origin and origin not in seen:
            seen.add(origin)
            unique.append(origin)
    return unique


def extract_request_origin(request) -> str:  # noqa: ANN001
    """Return normalized Origin/Referer base URL when present."""

    origin = normalize_origin(request.headers.get("Origin") or "")
    if origin:
        return origin
    referer = (request.headers.get("Referer") or "").strip()
    if not referer:
        return ""
    parsed = urlparse(referer)
    if parsed.scheme and parsed.netloc:
        return normalize_origin(f"{parsed.scheme}://{parsed.netloc}")
    return ""


def is_origin_allowed(request, config: LeadEngineConfig | None = None) -> bool:  # noqa: ANN001
    """Browser requests must come from a whitelisted origin; server-side calls may omit Origin."""

    origin = extract_request_origin(request)
    if not origin:
        return True
    return origin in get_allowed_ingest_origins(config)


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
    """Allow requests with a valid ingest-only API key and whitelisted browser origin."""

    message = "API key de ingestión de leads inválida, deshabilitada o dominio no autorizado."

    def has_permission(self, request, view) -> bool:  # noqa: ANN001
        config = LeadEngine.get_active_config()
        if not config.public_ingest_enabled:
            return False
        expected = resolve_lead_ingest_api_key(config)
        if not expected:
            return False
        provided = extract_lead_ingest_api_key(request)
        if not provided or not hmac.compare_digest(provided, expected):
            return False
        return is_origin_allowed(request, config)

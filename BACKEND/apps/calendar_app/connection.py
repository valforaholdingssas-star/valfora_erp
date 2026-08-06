"""Helpers to validate Google Calendar runtime connectivity."""

from __future__ import annotations

import json
from typing import Any

from apps.ai_config.models import AIRuntimeSettings
from apps.calendar_app.google_client import get_service_account_token, probe_calendar_access


def test_google_calendar_connection(runtime: AIRuntimeSettings | None = None) -> dict[str, Any]:
    """
    Validate service account JSON + calendar access.

    Returns a dict with ok/message and optional details for the admin UI.
    """
    runtime = runtime or AIRuntimeSettings.objects.order_by("-updated_at").first()
    if not runtime:
        return {"ok": False, "message": "No hay configuración runtime de IA."}
    if not (runtime.google_service_account_json or "").strip():
        return {"ok": False, "message": "Falta el JSON de la Service Account."}
    if not (runtime.google_calendar_id or "").strip():
        return {"ok": False, "message": "Falta el Calendar ID."}

    try:
        sa = json.loads(runtime.google_service_account_json)
    except json.JSONDecodeError:
        return {"ok": False, "message": "El JSON de la Service Account no es válido."}

    required = ("client_email", "private_key", "token_uri")
    missing = [k for k in required if not sa.get(k)]
    if missing:
        return {"ok": False, "message": f"JSON incompleto. Faltan: {', '.join(missing)}."}

    try:
        token = get_service_account_token(sa)
        probe = probe_calendar_access(
            access_token=token,
            calendar_id=runtime.google_calendar_id.strip(),
            timezone=runtime.google_calendar_timezone or "America/Bogota",
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "message": (
                "No se pudo acceder a Google Calendar. Verifica que el calendario esté "
                "compartido con el email de la Service Account (permiso de hacer cambios en eventos)."
            ),
            "detail": str(exc)[:300],
            "service_account_email": sa.get("client_email"),
        }

    return {
        "ok": True,
        "message": "Conexión a Google Calendar correcta.",
        "service_account_email": sa.get("client_email"),
        "calendar_id": runtime.google_calendar_id,
        "timezone": runtime.google_calendar_timezone,
        "enabled": bool(runtime.google_calendar_enabled),
        **probe,
    }

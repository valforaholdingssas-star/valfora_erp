"""Helpers for writing audit log entries."""

from __future__ import annotations

import json
import logging
from typing import Any

from apps.common.models import AuditLog

logger = logging.getLogger(__name__)


def json_safe(value: Any) -> Any:
    """Convert values so they can be stored in JSONField."""
    return json.loads(json.dumps(value, default=str))


def write_audit_log(
    *,
    user,
    action: str,
    instance: Any,
    changes: dict | None = None,
    request=None,
) -> AuditLog | None:
    """Persist an audit row for a model instance."""
    ip = getattr(request, "client_ip", None) if request else None
    ua = ""
    if request and hasattr(request, "META"):
        ua = (request.META.get("HTTP_USER_AGENT") or "")[:255]
    try:
        return AuditLog.objects.create(
            user=user if user and getattr(user, "is_authenticated", False) else None,
            action=action,
            model_name=instance.__class__.__name__,
            object_id=getattr(instance, "pk", None),
            changes=json_safe(changes or {}),
            ip_address=ip,
            user_agent=ua,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to write audit log action=%s model=%s object_id=%s",
            action,
            getattr(instance, "__class__", type("x", (), {})).__name__,
            getattr(instance, "pk", None),
        )
        return None

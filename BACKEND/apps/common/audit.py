"""Helpers for writing audit log entries."""

from typing import Any

from apps.common.models import AuditLog


def write_audit_log(
    *,
    user,
    action: str,
    instance: Any,
    changes: dict | None = None,
    request=None,
) -> AuditLog:
    """Persist an audit row for a model instance."""
    ip = getattr(request, "client_ip", None) if request else None
    ua = ""
    if request and hasattr(request, "META"):
        ua = (request.META.get("HTTP_USER_AGENT") or "")[:255]
    return AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        model_name=instance.__class__.__name__,
        object_id=getattr(instance, "pk", None),
        changes=changes or {},
        ip_address=ip,
        user_agent=ua,
    )

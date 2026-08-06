"""Helpers to resolve the call-desk assignee user."""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()


def resolve_call_stage_assignee():
    """Return the user that should own deals in the follow-up call stage."""
    email = (getattr(settings, "CRM_CALL_STAGE_ASSIGNEE_EMAIL", "") or "").strip()
    if email:
        user = User.objects.filter(is_active=True, email__iexact=email).first()
        if user:
            return user

    name = (getattr(settings, "CRM_CALL_STAGE_ASSIGNEE_NAME", "") or "").strip()
    if not name:
        return None

    parts = [part for part in name.split() if part]
    qs = User.objects.filter(is_active=True)
    if len(parts) >= 2:
        first, last = parts[0], parts[-1]
        user = qs.filter(first_name__icontains=first, last_name__icontains=last).first()
        if user:
            return user
    return qs.filter(
        Q(first_name__icontains=name)
        | Q(last_name__icontains=name)
        | Q(email__icontains=name.replace(" ", "."))
    ).first()

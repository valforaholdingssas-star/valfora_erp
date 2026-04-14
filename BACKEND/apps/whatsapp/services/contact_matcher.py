"""Contact matching and auto-creation from WhatsApp payloads."""

from __future__ import annotations

import re
from typing import Any

from apps.crm.models import Contact


def normalize_phone(raw_phone: str) -> str:
    """Normalize phone to numeric-only string."""

    return re.sub(r"\D", "", raw_phone or "")


def find_contact_by_phone(phone: str) -> Contact | None:
    """Find existing CRM contact by whatsapp or phone number."""

    digits = normalize_phone(phone)
    if not digits:
        return None
    for contact in Contact.objects.filter(is_active=True):
        for attr in ("whatsapp_number", "phone_number"):
            value = normalize_phone(getattr(contact, attr, ""))
            if value and (value.endswith(digits) or digits.endswith(value)):
                return contact
    return None


def get_or_create_contact_from_wa(
    phone: str,
    profile_name: str | None = None,
    defaults: dict[str, Any] | None = None,
) -> tuple[Contact, bool]:
    """Get existing contact or create a new lead contact from inbound WhatsApp."""

    found = find_contact_by_phone(phone)
    if found:
        return found, False

    safe_phone = normalize_phone(phone)
    pieces = (profile_name or "Nuevo Contacto").strip().split(" ", 1)
    first_name = pieces[0] if pieces else "Nuevo"
    last_name = pieces[1] if len(pieces) > 1 else "Contacto"

    payload = {
        "first_name": first_name,
        "last_name": last_name,
        "email": f"wa-{safe_phone or 'unknown'}@auto.local",
        "phone_number": safe_phone,
        "whatsapp_number": safe_phone,
        "source": "other",
        "intent_level": "warm",
        "lifecycle_stage": "new_lead",
    }
    if defaults:
        payload.update(defaults)

    contact = Contact.objects.create(**payload)
    return contact, True

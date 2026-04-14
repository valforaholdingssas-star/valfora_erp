"""Async webhook payload processing for WhatsApp events."""

from __future__ import annotations

import logging
from typing import Any

from apps.chat.models import Message
from apps.crm.lead_engine import LeadEngine
from apps.whatsapp.models import WhatsAppPhoneNumber

logger = logging.getLogger(__name__)


def process_webhook_payload(payload: dict[str, Any]) -> None:
    """Process all webhook entries from Meta payload."""

    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            metadata = value.get("metadata") or {}
            phone_number_id = metadata.get("phone_number_id")
            phone_number = _find_phone_number(phone_number_id)

            for status in value.get("statuses") or []:
                _process_status(status)

            contacts_index = {
                (c.get("wa_id") or ""): c for c in (value.get("contacts") or [])
            }
            for incoming in value.get("messages") or []:
                _process_incoming_message(incoming, contacts_index, phone_number)


def _find_phone_number(phone_number_id: str | None) -> WhatsAppPhoneNumber | None:
    if not phone_number_id:
        return None
    return WhatsAppPhoneNumber.objects.filter(phone_number_id=phone_number_id, is_active=True).first()


def _process_status(status_payload: dict[str, Any]) -> None:
    wa_message_id = status_payload.get("id")
    status = (status_payload.get("status") or "").lower()
    if not wa_message_id:
        return
    mapping = {
        "sent": "sent",
        "delivered": "delivered",
        "read": "read",
        "failed": "failed",
    }
    state = mapping.get(status)
    if not state:
        return
    message = Message.objects.filter(whatsapp_message_id=wa_message_id).first()
    if not message:
        return
    metadata = message.metadata or {}
    metadata["last_status_event"] = status_payload
    message.status = state
    message.metadata = metadata
    message.save(update_fields=["status", "metadata", "updated_at"])


def _process_incoming_message(
    payload: dict[str, Any],
    contacts_index: dict[str, dict[str, Any]],
    phone_number: WhatsAppPhoneNumber | None,
) -> None:
    wa_message_id = payload.get("id") or ""
    from_phone = payload.get("from") or ""
    if not from_phone or Message.objects.filter(whatsapp_message_id=wa_message_id).exists():
        return

    message_type = (payload.get("type") or "text").lower()
    content = _extract_message_text(payload, message_type)
    contact_payload = contacts_index.get(from_phone, {})
    profile_name = ((contact_payload.get("profile") or {}).get("name") or "").strip()

    lead_engine = LeadEngine()
    lead_engine.process_inbound_whatsapp_message(
        phone_number=from_phone,
        sender_name=profile_name,
        message_content=content,
        message_type=message_type,
        whatsapp_message_id=wa_message_id,
        whatsapp_phone_number=phone_number,
        metadata=payload,
    )


def _extract_message_text(payload: dict[str, Any], message_type: str) -> str:
    if message_type == "text":
        return ((payload.get("text") or {}).get("body") or "").strip()
    if message_type == "image":
        return ((payload.get("image") or {}).get("caption") or "[Imagen]").strip()
    if message_type == "document":
        return ((payload.get("document") or {}).get("caption") or "[Documento]").strip()
    if message_type == "audio":
        return "[Audio]"
    if message_type == "video":
        return ((payload.get("video") or {}).get("caption") or "[Video]").strip()
    if message_type == "location":
        return "[Ubicación]"
    return "[Mensaje]"

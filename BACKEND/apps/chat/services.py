"""Chat business logic and WhatsApp helpers."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from typing import Any

import requests
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.chat.models import Conversation, Message
from apps.crm.models import Contact

logger = logging.getLogger(__name__)


def find_contact_by_whatsapp_phone(phone: str) -> Contact | None:
    """Match CRM contact by WhatsApp or phone field (digits only)."""
    digits = "".join(c for c in phone if c.isdigit())
    if not digits:
        return None
    qs = Contact.objects.filter(is_active=True)
    for c in qs:
        for field in ("whatsapp_number", "phone_number"):
            raw = getattr(c, field, "") or ""
            cd = "".join(x for x in raw if x.isdigit())
            if cd and (digits.endswith(cd) or cd.endswith(digits) or digits == cd):
                return c
    return None


def get_or_create_whatsapp_conversation(contact: Contact) -> tuple[Conversation, bool]:
    """Return WhatsApp conversation for contact."""
    deal = (
        contact.deals.filter(is_active=True)
        .exclude(stage__in=["closed_won", "closed_lost"])
        .order_by("-updated_at", "-created_at")
        .first()
    ) or contact.deals.filter(is_active=True).order_by("-updated_at", "-created_at").first()
    if deal:
        conv, created = Conversation.objects.get_or_create(
            deal=deal,
            channel="whatsapp",
            defaults={
                "contact": contact,
                "assigned_to": contact.assigned_to,
                "status": "active",
            },
        )
    else:
        conv, created = Conversation.objects.get_or_create(
            contact=contact,
            deal=None,
            channel="whatsapp",
            defaults={
                "assigned_to": contact.assigned_to,
                "status": "active",
            },
        )
    return conv, created


def _whatsapp_media_id_from_raw(raw: dict[str, Any], message_type: str) -> str:
    """Extract Graph API media id for inbound image/audio/video/document."""
    if message_type == "image":
        return str((raw.get("image") or {}).get("id") or "")
    if message_type == "audio":
        return str((raw.get("audio") or {}).get("id") or "")
    if message_type == "video":
        return str((raw.get("video") or {}).get("id") or "")
    if message_type == "document":
        return str((raw.get("document") or {}).get("id") or "")
    return ""


@transaction.atomic
def create_inbound_whatsapp_message(
    *,
    wa_message_id: str,
    from_phone: str,
    body: str,
    raw_payload: dict[str, Any],
    message_type: str = "text",
    media_id: str | None = None,
) -> Message | None:
    """Persist inbound WhatsApp message (text or media; idempotent by wa_message_id)."""
    if wa_message_id and Message.objects.filter(whatsapp_message_id=wa_message_id).exists():
        return None
    contact = find_contact_by_whatsapp_phone(from_phone)
    if not contact:
        logger.warning("No CRM contact for WhatsApp sender %s", from_phone)
        return None
    conv, _ = get_or_create_whatsapp_conversation(contact)
    mt = message_type if message_type in dict(Message.TYPE_CHOICES) else "text"
    display = (body or "").strip()
    if mt != "text" and not display:
        display = f"[{mt.capitalize()} entrante]"
    msg = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content=display,
        message_type=mt,
        whatsapp_message_id=wa_message_id or "",
        status="delivered",
        metadata={"raw": raw_payload, "from": from_phone, "whatsapp_type": message_type},
    )
    Conversation.objects.filter(pk=conv.pk).update(
        updated_at=timezone.now(),
        unread_count=F("unread_count") + 1,
    )
    mid = (media_id or "").strip() or _whatsapp_media_id_from_raw(raw_payload, mt)
    if mid and mt != "text":
        from apps.chat.tasks import fetch_whatsapp_media_for_message

        fetch_whatsapp_media_for_message.delay(str(msg.id), mid)
    return msg


def verify_meta_webhook_signature(payload_body: bytes, signature_header: str | None) -> bool:
    """Validate X-Hub-Signature-256 from Meta webhook."""
    secret = os.getenv("WHATSAPP_APP_SECRET", "").strip()
    if not secret:
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    received = signature_header.replace("sha256=", "", 1)
    return hmac.compare_digest(expected, received)


def send_whatsapp_text_message(*, to_e164: str, body: str) -> dict[str, Any]:
    """Send outbound WhatsApp Cloud API text message."""
    phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    api_url = os.getenv("WHATSAPP_API_URL", "https://graph.facebook.com/v18.0").rstrip("/")
    if not phone_id or not token:
        raise RuntimeError("WhatsApp API is not configured (phone id / token).")
    url = f"{api_url}/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to_e164,
        "type": "text",
        "text": {"body": body[:4096]},
    }
    response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=30)
    data: dict[str, Any] = {}
    try:
        data = response.json()
    except json.JSONDecodeError:
        data = {"raw": response.text}
    if response.status_code >= 400:
        logger.error("WhatsApp send failed: %s %s", response.status_code, data)
        raise RuntimeError(str(data))
    return data


def get_whatsapp_media_metadata(media_id: str) -> dict[str, Any]:
    """GET /{media-id} from Graph API (URL + mime type for download)."""
    token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    api_url = os.getenv("WHATSAPP_API_URL", "https://graph.facebook.com/v18.0").rstrip("/")
    if not token or not media_id:
        raise RuntimeError("WhatsApp token or media id missing.")
    url = f"{api_url}/{media_id}"
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(url, headers=headers, timeout=30)
    try:
        data = response.json()
    except json.JSONDecodeError:
        data = {"raw": response.text}
    if response.status_code >= 400:
        raise RuntimeError(str(data))
    return data


def download_whatsapp_media_binary(media_id: str) -> tuple[bytes, str]:
    """Download binary content for a WhatsApp media id."""
    meta = get_whatsapp_media_metadata(media_id)
    download_url = meta.get("url") or ""
    mime = meta.get("mime_type", "application/octet-stream")
    if not download_url:
        raise RuntimeError("No download URL in media metadata")
    token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(download_url, headers=headers, timeout=120)
    if response.status_code >= 400:
        raise RuntimeError(response.text)
    return response.content, str(mime)


def apply_whatsapp_delivery_status(*, wa_message_id: str, status: str) -> int:
    """Map Meta delivery status to Message.status. Returns rows updated."""
    if not wa_message_id:
        return 0
    mapping = {
        "sent": "sent",
        "delivered": "delivered",
        "read": "read",
        "failed": "failed",
    }
    st = mapping.get((status or "").lower())
    if not st:
        return 0
    return Message.objects.filter(whatsapp_message_id=wa_message_id).update(
        status=st,
        updated_at=timezone.now(),
    )

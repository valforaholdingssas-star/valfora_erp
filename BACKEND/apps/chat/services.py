"""Chat business logic and WhatsApp helpers."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from datetime import timedelta
from typing import Any

import requests
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.ai_config.runtime import resolve_global_ai_mode_enabled
from apps.chat.models import Conversation, Message
from apps.crm.models import Contact
from apps.crm.pipeline_automation import PipelineAutomationService
from apps.whatsapp.models import WhatsAppPhoneNumber

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


def _resolve_contact_whatsapp_deal(contact: Contact):
    closed_stage_keys = PipelineAutomationService.get_closed_stage_keys()
    return (
        contact.deals.filter(is_active=True)
        .exclude(stage__in=closed_stage_keys)
        .order_by("-updated_at", "-created_at")
        .first()
    ) or contact.deals.filter(is_active=True).order_by("-updated_at", "-created_at").first()


def _conversation_has_history(conversation: Conversation) -> bool:
    if conversation.last_inbound_message_at or conversation.last_message_at:
        return True
    return conversation.messages.filter(is_active=True).exists()


def get_whatsapp_history_conversation_ids(conversation: Conversation) -> list[str]:
    """Return the ordered set of WhatsApp conversation ids that belong to the same real thread.

    Rules:
    - Never mix histories across different deals for the same contact.
    - Allow legacy contact-only conversations (`deal is null`) to contribute history.
    - Respect WhatsApp line when the current conversation is tied to a specific number.
    """
    if not conversation or conversation.channel != "whatsapp":
        return [str(conversation.id)] if conversation else []

    if not conversation.contact_id:
        return [str(conversation.id)]

    siblings = Conversation.objects.filter(
        channel="whatsapp",
        contact_id=conversation.contact_id,
    )

    if conversation.whatsapp_phone_number_id:
        siblings = siblings.filter(
            whatsapp_phone_number_id=conversation.whatsapp_phone_number_id
        )
    else:
        siblings = siblings.filter(whatsapp_phone_number_id__isnull=True)

    if conversation.deal_id:
        siblings = siblings.filter(
            Q(deal_id=conversation.deal_id) | Q(deal__isnull=True)
        )
    else:
        siblings = siblings.filter(deal__isnull=True)

    ordered = siblings.order_by("created_at", "id").values_list("id", flat=True)
    ids = []
    seen = set()
    for raw_id in ordered:
        key = str(raw_id)
        if key in seen:
            continue
        seen.add(key)
        ids.append(key)
    if str(conversation.id) not in seen:
        ids.append(str(conversation.id))
    return ids


def resolve_whatsapp_conversation(
    contact: Contact,
    *,
    deal=None,
    assigned_to=None,
    whatsapp_phone_number: WhatsAppPhoneNumber | None = None,
    ai_mode_enabled: bool | None = None,
    status: str = "active",
    ai_configuration=None,
) -> tuple[Conversation, bool]:
    """Return the canonical WhatsApp conversation for a contact/deal pair.

    This auto-heals legacy splits where the message history lives on a contact-only
    conversation while the UI opens an empty deal-linked conversation.
    """
    target_deal = deal or _resolve_contact_whatsapp_deal(contact)
    resolved_ai_mode = resolve_global_ai_mode_enabled() if ai_mode_enabled is None else bool(ai_mode_enabled)
    base_defaults = {
        "contact": contact,
        "assigned_to": assigned_to or contact.assigned_to,
        "status": status or "active",
        "is_active": True,
        "ai_mode_enabled": resolved_ai_mode,
        "ai_configuration": ai_configuration,
    }

    deal_conversation = None
    if target_deal:
        deal_conversation = (
            Conversation.objects.filter(deal=target_deal, channel="whatsapp", is_active=True)
            .order_by("-updated_at", "-created_at")
            .first()
        )

    sibling_conversations = (
        Conversation.objects.filter(contact=contact, channel="whatsapp")
        .exclude(pk=getattr(deal_conversation, "pk", None))
        .order_by("-last_message_at", "-updated_at", "-created_at")
    )
    sibling_with_history = None
    for sibling in sibling_conversations:
        if _conversation_has_history(sibling):
            sibling_with_history = sibling
            break

    created = False
    conversation = deal_conversation

    if (
        conversation
        and not _conversation_has_history(conversation)
        and sibling_with_history
        and sibling_with_history.deal_id in {None, getattr(target_deal, "id", None)}
    ):
        conversation.is_active = False
        conversation.deal = None
        conversation.closed_at = timezone.now()
        conversation.save(update_fields=["is_active", "deal", "closed_at", "updated_at"])
        conversation = sibling_with_history
        if target_deal:
            conversation.deal = target_deal
    elif not conversation and sibling_with_history and sibling_with_history.deal_id in {None, getattr(target_deal, "id", None)}:
        conversation = sibling_with_history
        if target_deal and sibling_with_history.deal_id is None:
            conversation.deal = target_deal

    if not conversation:
        conversation = Conversation.objects.create(
            channel="whatsapp",
            deal=target_deal,
            whatsapp_phone_number=whatsapp_phone_number,
            closed_at=None,
            **base_defaults,
        )
        created = True
    else:
        conversation.contact = contact
        conversation.assigned_to = base_defaults["assigned_to"]
        conversation.status = base_defaults["status"]
        conversation.is_active = True
        conversation.ai_mode_enabled = base_defaults["ai_mode_enabled"]
        conversation.ai_configuration = ai_configuration
        if target_deal and not conversation.deal_id:
            conversation.deal = target_deal
        if whatsapp_phone_number and not conversation.whatsapp_phone_number_id:
            conversation.whatsapp_phone_number = whatsapp_phone_number
        if conversation.status != "archived":
            conversation.closed_at = None
        conversation.save()
    return conversation, created


def get_or_create_whatsapp_conversation(contact: Contact) -> tuple[Conversation, bool]:
    """Return canonical WhatsApp conversation for contact."""
    return resolve_whatsapp_conversation(contact)


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
    conv, _ = resolve_whatsapp_conversation(
        contact,
        whatsapp_phone_number=None,
        status="active",
    )
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
        last_inbound_message_at=timezone.now(),
        customer_service_window_expires=timezone.now() + timedelta(hours=24),
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


def _resolve_whatsapp_api_credentials(
    phone_number: WhatsAppPhoneNumber | None = None,
) -> tuple[str, str]:
    """Resolve Graph API base URL and bearer token for media operations."""
    if phone_number and phone_number.account_id and phone_number.account.access_token:
        api_url = f"https://graph.facebook.com/{phone_number.account.api_version}".rstrip("/")
        token = str(phone_number.account.access_token or "").strip()
        if token:
            return api_url, token

    token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    api_url = os.getenv("WHATSAPP_API_URL", "https://graph.facebook.com/v18.0").rstrip("/")
    return api_url, token


def get_whatsapp_media_metadata(
    media_id: str,
    *,
    phone_number: WhatsAppPhoneNumber | None = None,
) -> dict[str, Any]:
    """GET /{media-id} from Graph API (URL + mime type for download)."""
    api_url, token = _resolve_whatsapp_api_credentials(phone_number)
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


def download_whatsapp_media_binary(
    media_id: str,
    *,
    phone_number: WhatsAppPhoneNumber | None = None,
) -> tuple[bytes, str]:
    """Download binary content for a WhatsApp media id."""
    meta = get_whatsapp_media_metadata(media_id, phone_number=phone_number)
    download_url = meta.get("url") or ""
    mime = meta.get("mime_type", "application/octet-stream")
    if not download_url:
        raise RuntimeError("No download URL in media metadata")
    _, token = _resolve_whatsapp_api_credentials(phone_number)
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

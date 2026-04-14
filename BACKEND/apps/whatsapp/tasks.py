"""Celery tasks for WhatsApp integration."""

from __future__ import annotations

import json
import logging
from datetime import timedelta

from celery import shared_task
from django.db.models import Q
from django.utils import timezone
from requests import RequestException

from apps.chat.models import Conversation, Message
from apps.whatsapp.models import WhatsAppPhoneNumber, WhatsAppTemplate
from apps.whatsapp.services.template_manager import sync_templates_for_phone
from apps.whatsapp.services.webhook_processor import process_webhook_payload
from apps.whatsapp.services.whatsapp_api_service import WhatsAppAPIService

logger = logging.getLogger(__name__)


@shared_task(name="whatsapp.tasks.process_whatsapp_webhook")
def process_whatsapp_webhook(payload: dict) -> None:
    """Process inbound webhook payload asynchronously."""

    process_webhook_payload(payload)


@shared_task(
    bind=True,
    autoretry_for=(RequestException, TimeoutError, RuntimeError),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
    name="whatsapp.tasks.send_whatsapp_message",
)
def send_whatsapp_message(self, message_id: str) -> None:
    """Send a pending chat message through WhatsApp API."""

    del self
    message = Message.objects.select_related(
        "conversation",
        "conversation__contact",
        "conversation__whatsapp_phone_number__account",
    ).filter(pk=message_id).first()
    if not message:
        return
    conv = message.conversation
    if conv.channel != "whatsapp" or message.sender_type not in {"user", "ai_bot"}:
        return
    phone = conv.whatsapp_phone_number or WhatsAppPhoneNumber.objects.filter(is_default=True, is_active=True).first()
    if not phone:
        message.status = "failed"
        message.metadata = {**(message.metadata or {}), "error": "No WhatsApp phone configured"}
        message.save(update_fields=["status", "metadata", "updated_at"])
        return

    service = WhatsAppAPIService(phone)
    to_number = (conv.contact.whatsapp_number or conv.contact.phone_number or "").strip()
    if not to_number:
        message.status = "failed"
        message.metadata = {**(message.metadata or {}), "error": "Contact without WhatsApp number"}
        message.save(update_fields=["status", "metadata", "updated_at"])
        return

    attachment = message.attachments.filter(is_active=True).order_by("-created_at").first()
    uploaded_media_id = None

    if message.message_type == "text":
        response = service.send_text_message(to=to_number, body=message.content)
    elif message.message_type == "image":
        media_id = (message.metadata or {}).get("whatsapp_uploaded_media_id")
        if attachment and not media_id:
            media_id = service.upload_media(
                attachment.file.path,
                attachment.file_type or "image/jpeg",
            )
        uploaded_media_id = media_id
        if media_id:
            response = service.send_image_message(to=to_number, image_id=media_id, caption=message.content)
        else:
            response = service.send_image_message(to=to_number, image_url=(message.metadata or {}).get("link"), caption=message.content)
    elif message.message_type == "document":
        media_id = (message.metadata or {}).get("whatsapp_uploaded_media_id")
        if attachment and not media_id:
            media_id = service.upload_media(
                attachment.file.path,
                attachment.file_type or "application/octet-stream",
            )
        uploaded_media_id = media_id
        if media_id:
            response = service.send_document_message(
                to=to_number,
                document_id=media_id,
                filename=attachment.file_name if attachment else None,
                caption=message.content,
            )
        else:
            response = service.send_document_message(to=to_number, document_url=(message.metadata or {}).get("link"), caption=message.content)
    else:
        response = service.send_text_message(to=to_number, body=message.content)

    wa_id = ((response.get("messages") or [{}])[0]).get("id")
    message.status = "sent"
    message.whatsapp_message_id = wa_id or message.whatsapp_message_id
    message.metadata = {
        **(message.metadata or {}),
        "send_response": response,
        "whatsapp_uploaded_media_id": uploaded_media_id,
    }
    message.save(update_fields=["status", "whatsapp_message_id", "metadata", "updated_at"])


@shared_task(
    bind=True,
    autoretry_for=(RequestException, TimeoutError, RuntimeError),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
    name="whatsapp.tasks.send_whatsapp_template",
)
def send_whatsapp_template(self, message_id: str, template_id: str, variables: list[str] | None = None) -> None:
    """Send approved WhatsApp template for a conversation message."""

    del self
    message = Message.objects.select_related(
        "conversation",
        "conversation__contact",
        "conversation__whatsapp_phone_number__account",
    ).filter(pk=message_id).first()
    template = WhatsAppTemplate.objects.filter(pk=template_id, is_active=True).first()
    if not message or not template:
        return

    conv = message.conversation
    phone = conv.whatsapp_phone_number or WhatsAppPhoneNumber.objects.filter(account=template.account, is_default=True, is_active=True).first()
    if not phone:
        raise RuntimeError("No phone number available for template sending")

    params = []
    for value in (variables or []):
        params.append({"type": "text", "text": str(value)})
    components = [{"type": "body", "parameters": params}] if params else []

    service = WhatsAppAPIService(phone)
    to_number = (conv.contact.whatsapp_number or conv.contact.phone_number or "").strip()
    response = service.send_template_message(
        to=to_number,
        template_name=template.name,
        language=template.language,
        components=components,
    )
    wa_id = ((response.get("messages") or [{}])[0]).get("id")
    message.status = "sent"
    message.whatsapp_message_id = wa_id or message.whatsapp_message_id
    message.metadata = {
        **(message.metadata or {}),
        "send_response": response,
        "template_id": str(template.id),
        "template_variables": variables or [],
    }
    message.save(update_fields=["status", "whatsapp_message_id", "metadata", "updated_at"])


@shared_task(name="whatsapp.tasks.sync_whatsapp_templates")
def sync_whatsapp_templates(account_id: str | None = None) -> int:
    """Sync templates for one account or all active default phones."""

    phones = WhatsAppPhoneNumber.objects.filter(is_active=True)
    if account_id:
        phones = phones.filter(account_id=account_id)
    total = 0
    for phone in phones.select_related("account"):
        try:
            total += sync_templates_for_phone(phone)
        except Exception:  # noqa: BLE001
            logger.exception("Template sync failed for phone %s", phone.id)
    return total


@shared_task(name="whatsapp.tasks.sync_whatsapp_phone_numbers")
def sync_whatsapp_phone_numbers(account_id: str) -> int:
    """Sync phone numbers from Meta for a given account."""

    from apps.whatsapp.models import WhatsAppBusinessAccount

    account = WhatsAppBusinessAccount.objects.filter(pk=account_id, is_active=True).first()
    if not account:
        return 0
    tmp_phone = WhatsAppPhoneNumber(
        account=account,
        phone_number_id="temp",
        display_phone_number="temp",
    )
    service = WhatsAppAPIService(tmp_phone)
    url = f"https://graph.facebook.com/{account.api_version}/{account.waba_id}/phone_numbers"
    import requests

    response = requests.get(url, headers=service.headers, timeout=30)
    body = response.json() if response.content else {}
    if response.status_code >= 400:
        raise RuntimeError(str(body))
    synced = 0
    for item in body.get("data") or []:
        WhatsAppPhoneNumber.objects.update_or_create(
            phone_number_id=item.get("id") or "",
            defaults={
                "account": account,
                "display_phone_number": item.get("display_phone_number") or "",
                "verified_name": item.get("verified_name") or "",
                "quality_rating": (item.get("quality_rating") or "UNKNOWN").upper(),
                "messaging_limit": item.get("messaging_limit") or "TIER_250",
                "status": "connected",
                "is_active": True,
            },
        )
        synced += 1
    return synced


@shared_task(name="whatsapp.tasks.check_expired_service_windows")
def check_expired_service_windows() -> int:
    """Clear expired service windows from WhatsApp conversations."""

    now = timezone.now()
    qs = Conversation.objects.filter(
        channel="whatsapp",
        customer_service_window_expires__isnull=False,
        customer_service_window_expires__lt=now,
    )
    return qs.update(updated_at=now)


@shared_task(name="whatsapp.tasks.download_whatsapp_media")
def download_whatsapp_media(message_id: str, media_id: str) -> bytes:
    """Proxy helper for media download (not persisted here)."""

    message = Message.objects.select_related("conversation__whatsapp_phone_number__account").filter(pk=message_id).first()
    if not message:
        return b""
    phone = message.conversation.whatsapp_phone_number
    if not phone:
        return b""
    service = WhatsAppAPIService(phone)
    binary = service.download_media(media_id)
    return binary


@shared_task(name="whatsapp.tasks.update_whatsapp_quality_rating")
def update_whatsapp_quality_rating() -> int:
    """Refresh quality rating for active phone numbers."""

    updated = 0
    for phone in WhatsAppPhoneNumber.objects.filter(is_active=True).select_related("account"):
        try:
            tmp_service = WhatsAppAPIService(phone)
            response = tmp_service._get("", params={"fields": "quality_rating,messaging_limit"})
            quality = (response.get("quality_rating") or phone.quality_rating).upper()
            limit = response.get("messaging_limit") or phone.messaging_limit
            phone.quality_rating = quality
            phone.messaging_limit = limit
            phone.save(update_fields=["quality_rating", "messaging_limit", "updated_at"])
            updated += 1
        except Exception:  # noqa: BLE001
            logger.exception("Failed quality refresh for phone %s", phone.id)
    return updated


@shared_task(name="whatsapp.tasks.send_whatsapp_bulk_template")
def send_whatsapp_bulk_template(template_id: str, contact_ids: list[str], variables_json: str = "[]") -> int:
    """Enqueue template sends for bulk campaign."""

    from apps.crm.models import Contact

    variables = json.loads(variables_json or "[]")
    sent = 0
    template = WhatsAppTemplate.objects.filter(pk=template_id, is_active=True, status="approved").first()
    if not template:
        return sent
    for contact in Contact.objects.filter(id__in=contact_ids, is_active=True):
        conv, _ = Conversation.objects.get_or_create(
            contact=contact,
            channel="whatsapp",
            defaults={
                "status": "active",
                "assigned_to": contact.assigned_to,
                "whatsapp_phone_number": WhatsAppPhoneNumber.objects.filter(account=template.account, is_default=True, is_active=True).first(),
            },
        )
        msg = Message.objects.create(
            conversation=conv,
            sender_type="user",
            content=f"Template: {template.name}",
            message_type="text",
            status="pending",
            metadata={"bulk": True},
        )
        send_whatsapp_template.delay(str(msg.id), str(template.id), variables)
        sent += 1
    return sent

"""Meta WhatsApp Cloud API webhook (verification + inbound)."""

from __future__ import annotations

import json
import logging
import os

from django.http import HttpResponse, HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.chat.services import (
    apply_whatsapp_delivery_status,
    create_inbound_whatsapp_message,
    verify_meta_webhook_signature,
)

logger = logging.getLogger(__name__)


def _parse_inbound_messages(payload: dict) -> list[dict]:
    """Extract simplified inbound messages from Meta webhook JSON."""
    out: list[dict] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for msg in value.get("messages") or []:
                msg_type = msg.get("type") or "unknown"
                from_phone = msg.get("from") or ""
                wa_id = msg.get("id") or ""
                body = ""
                if msg_type == "text":
                    body = (msg.get("text") or {}).get("body") or ""
                elif msg_type == "image":
                    body = (msg.get("image") or {}).get("caption") or msg.get("caption") or ""
                elif msg_type in ("audio", "video", "document"):
                    body = msg.get("caption") or ""
                out.append(
                    {
                        "id": wa_id,
                        "from": from_phone,
                        "type": msg_type,
                        "body": body,
                        "raw": msg,
                    }
                )
    return out


def _parse_status_updates(payload: dict) -> list[dict]:
    """Extract message delivery status events from webhook JSON."""
    out: list[dict] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for st in value.get("statuses") or []:
                out.append(
                    {
                        "id": st.get("id") or "",
                        "status": st.get("status") or "",
                    }
                )
    return out


@csrf_exempt
@require_http_methods(["GET", "POST"])
def whatsapp_webhook(request):
    """Verify webhook (GET) or receive events (POST)."""
    verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN", "")

    if request.method == "GET":
        mode = request.GET.get("hub.mode")
        token = request.GET.get("hub.verify_token")
        challenge = request.GET.get("hub.challenge")
        if mode == "subscribe" and token and verify_token and token == verify_token and challenge:
            return HttpResponse(challenge, content_type="text/plain")
        return HttpResponseForbidden("Verification failed")

    raw_body = request.body
    sig = request.META.get("HTTP_X_HUB_SIGNATURE_256")
    if not verify_meta_webhook_signature(raw_body, sig):
        return HttpResponseForbidden("Invalid signature")

    try:
        payload = json.loads(raw_body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    for su in _parse_status_updates(payload):
        try:
            apply_whatsapp_delivery_status(wa_message_id=su["id"], status=su["status"])
        except Exception:  # noqa: BLE001
            logger.exception("Failed to apply WhatsApp status update")

    allowed = {"text", "image", "audio", "video", "document"}
    for item in _parse_inbound_messages(payload):
        mtype = item.get("type")
        if mtype not in allowed:
            continue
        try:
            create_inbound_whatsapp_message(
                wa_message_id=item["id"],
                from_phone=item["from"],
                body=item.get("body") or "",
                raw_payload=item["raw"],
                message_type="text" if mtype == "text" else mtype,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to store inbound WhatsApp message")

    return HttpResponse(status=200)

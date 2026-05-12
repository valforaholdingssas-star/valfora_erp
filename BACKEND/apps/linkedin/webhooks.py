"""Webhook handlers for Unipile events."""

from __future__ import annotations

import hashlib
import json

from django.http import HttpResponseForbidden, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.ai_config.runtime import resolve_unipile_webhook_secret
from apps.linkedin.models import LinkedInWebhookEvent
from apps.linkedin.tasks import handle_account_status, handle_new_message, handle_new_relation


def _payload_hash(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


@csrf_exempt
@require_POST
def unipile_webhook(request):
    """Process inbound Unipile webhook events securely and idempotently."""
    auth_header = request.headers.get("Unipile-Auth", "")
    secret = str(resolve_unipile_webhook_secret()).strip()
    if not secret or auth_header != secret:
        return HttpResponseForbidden()

    raw = request.body or b"{}"
    payload = json.loads(raw)
    event = payload.get("event", "")
    external_event_id = str(payload.get("event_id") or payload.get("id") or _payload_hash(raw))
    account_id = str(payload.get("account_id") or "")

    obj, created = LinkedInWebhookEvent.objects.get_or_create(
        external_event_id=external_event_id,
        defaults={
            "event_name": event or "unknown",
            "account_external_id": account_id,
            "payload": payload,
            "status": "received",
        },
    )
    if not created:
        return JsonResponse({"status": "duplicate"}, status=200)

    if event == "message_received":
        handle_new_message.delay(str(obj.id))
    elif event == "new_relation":
        handle_new_relation.delay(str(obj.id))
    elif event in ("account_connected", "account_disconnected", "account_credentials"):
        handle_account_status.delay(str(obj.id))

    return JsonResponse({"status": "ok"}, status=200)

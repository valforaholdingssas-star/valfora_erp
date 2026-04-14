"""Views for WhatsApp webhook endpoints."""

from __future__ import annotations

import hashlib
import hmac
import json

from django.http import HttpResponse, HttpResponseForbidden
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.whatsapp.models import WhatsAppBusinessAccount
from apps.whatsapp.tasks import process_whatsapp_webhook


def _validate_signature(raw_body: bytes, signature: str | None) -> bool:
    account = WhatsAppBusinessAccount.objects.filter(is_active=True).order_by("-updated_at").first()
    if not account or not account.webhook_secret:
        return True
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(account.webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    got = signature.replace("sha256=", "", 1)
    return hmac.compare_digest(expected, got)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def whatsapp_webhook(request):
    """Meta verification challenge + event receiver."""

    account = WhatsAppBusinessAccount.objects.filter(is_active=True).order_by("-updated_at").first()

    if request.method == "GET":
        mode = request.GET.get("hub.mode")
        token = request.GET.get("hub.verify_token")
        challenge = request.GET.get("hub.challenge")
        if account and mode == "subscribe" and token == account.webhook_verify_token and challenge:
            return HttpResponse(challenge, content_type="text/plain")
        return HttpResponseForbidden("Verification failed")

    raw_body = request.body or b"{}"
    if not _validate_signature(raw_body, request.META.get("HTTP_X_HUB_SIGNATURE_256")):
        return HttpResponseForbidden("Invalid signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        payload = {}

    process_whatsapp_webhook.delay(payload)
    return HttpResponse(status=200)

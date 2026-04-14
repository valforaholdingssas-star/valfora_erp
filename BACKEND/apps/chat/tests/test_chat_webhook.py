"""WhatsApp webhook POST (signature) tests."""

import hashlib
import hmac

import pytest
from django.test import Client


@pytest.mark.django_db
def test_whatsapp_post_rejects_invalid_signature(monkeypatch):
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "secret")
    body = b'{"object":"whatsapp_business_account","entry":[]}'
    c = Client()
    r = c.post(
        "/api/v1/chat/webhooks/whatsapp/",
        data=body,
        content_type="application/json",
        HTTP_X_HUB_SIGNATURE_256="sha256=deadbeef",
    )
    assert r.status_code == 403


@pytest.mark.django_db
def test_whatsapp_post_accepts_valid_signature(monkeypatch):
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "secret")
    body = b'{"object":"whatsapp_business_account","entry":[]}'
    sig = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
    c = Client()
    r = c.post(
        "/api/v1/chat/webhooks/whatsapp/",
        data=body,
        content_type="application/json",
        HTTP_X_HUB_SIGNATURE_256=sig,
    )
    assert r.status_code == 200

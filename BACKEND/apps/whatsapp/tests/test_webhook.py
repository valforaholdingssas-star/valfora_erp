"""Functional tests for WhatsApp webhook endpoints."""

import hashlib
import hmac
import json

import pytest
from django.test import Client

from apps.whatsapp.models import WhatsAppBusinessAccount


@pytest.fixture
def wa_account(db):
    return WhatsAppBusinessAccount.objects.create(
        name="Main WABA",
        waba_id="waba-123",
        access_token="token-123",
        webhook_verify_token="verify-123",
        webhook_secret="secret-123",
    )


@pytest.mark.django_db
def test_whatsapp_webhook_get_valid_token_returns_challenge(wa_account):
    del wa_account
    client = Client()
    response = client.get(
        "/api/v1/whatsapp/webhook/?hub.mode=subscribe&hub.verify_token=verify-123&hub.challenge=abc123"
    )
    assert response.status_code == 200
    assert response.content.decode() == "abc123"


@pytest.mark.django_db
def test_whatsapp_webhook_get_invalid_token_returns_403(wa_account):
    del wa_account
    client = Client()
    response = client.get("/api/v1/whatsapp/webhook/?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1")
    assert response.status_code == 403


@pytest.mark.django_db
def test_whatsapp_webhook_post_rejects_invalid_signature(wa_account):
    del wa_account
    body = b'{"object":"whatsapp_business_account","entry":[]}'
    client = Client()
    response = client.post(
        "/api/v1/whatsapp/webhook/",
        data=body,
        content_type="application/json",
        HTTP_X_HUB_SIGNATURE_256="sha256=invalid",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_whatsapp_webhook_post_enqueues_payload_with_valid_signature(wa_account, monkeypatch):
    del wa_account
    calls = []

    def fake_delay(payload):
        calls.append(payload)

    monkeypatch.setattr("apps.whatsapp.views.process_whatsapp_webhook.delay", fake_delay)

    payload = {"object": "whatsapp_business_account", "entry": [{"changes": []}]}
    raw = json.dumps(payload).encode("utf-8")
    sig = "sha256=" + hmac.new(b"secret-123", raw, hashlib.sha256).hexdigest()

    client = Client()
    response = client.post(
        "/api/v1/whatsapp/webhook/",
        data=raw,
        content_type="application/json",
        HTTP_X_HUB_SIGNATURE_256=sig,
    )
    assert response.status_code == 200
    assert calls == [payload]

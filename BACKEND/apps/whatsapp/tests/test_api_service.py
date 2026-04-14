"""Tests for WhatsApp API wrapper service."""

import pytest

from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber, WhatsAppTemplate
from apps.whatsapp.services.whatsapp_api_service import WhatsAppAPIError, WhatsAppAPIService


class DummyResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = b"{}"

    def json(self):
        return self._payload


@pytest.fixture
def wa_phone(db):
    account = WhatsAppBusinessAccount.objects.create(
        name="Main",
        waba_id="waba-1",
        access_token="token-1",
        webhook_verify_token="verify-1",
        webhook_secret="secret-1",
    )
    return WhatsAppPhoneNumber.objects.create(
        account=account,
        phone_number_id="phone-id-1",
        display_phone_number="+57 300 000 0000",
        verified_name="Valfora",
        status="connected",
        is_default=True,
    )


@pytest.mark.django_db
def test_send_text_message_posts_expected_payload(wa_phone, monkeypatch):
    calls = []

    def fake_post(url, json, headers, timeout):  # noqa: A002
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return DummyResponse(200, {"messages": [{"id": "wamid-1"}]})

    monkeypatch.setattr("apps.whatsapp.services.whatsapp_api_service.requests.post", fake_post)
    service = WhatsAppAPIService(wa_phone)
    response = service.send_text_message(to="573001234567", body="Hola mundo")

    assert response["messages"][0]["id"] == "wamid-1"
    assert len(calls) == 1
    assert calls[0]["url"].endswith(f"/{wa_phone.phone_number_id}/messages")
    assert calls[0]["json"]["type"] == "text"
    assert calls[0]["json"]["text"]["body"] == "Hola mundo"


@pytest.mark.django_db
def test_send_template_message_raises_api_error_on_4xx(wa_phone, monkeypatch):
    def fake_post(url, json, headers, timeout):  # noqa: A002, ARG001
        return DummyResponse(400, {"error": {"message": "invalid"}})

    monkeypatch.setattr("apps.whatsapp.services.whatsapp_api_service.requests.post", fake_post)
    service = WhatsAppAPIService(wa_phone)

    with pytest.raises(WhatsAppAPIError):
        service.send_template_message(
            to="573001234567",
            template_name="follow_up",
            language="es",
            components=[],
        )


@pytest.mark.django_db
def test_sync_templates_creates_records_from_meta_payload(wa_phone, monkeypatch):
    def fake_get(url, headers, timeout):  # noqa: ARG001
        return DummyResponse(
            200,
            {
                "data": [
                    {
                        "id": "meta-tpl-1",
                        "name": "follow_up",
                        "language": "es",
                        "category": "UTILITY",
                        "status": "APPROVED",
                        "components": [{"type": "BODY", "text": "Hola {{1}}"}],
                    }
                ]
            },
        )

    monkeypatch.setattr("apps.whatsapp.services.whatsapp_api_service.requests.get", fake_get)
    service = WhatsAppAPIService(wa_phone)
    synced = service.sync_templates()

    assert synced == 1
    template = WhatsAppTemplate.objects.get(account=wa_phone.account, name="follow_up", language="es")
    assert template.meta_template_id == "meta-tpl-1"
    assert template.status == "approved"
    assert template.body_text == "Hola {{1}}"

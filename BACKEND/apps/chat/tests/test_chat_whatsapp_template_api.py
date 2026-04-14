"""Tests for WhatsApp template sending flow from chat API."""

import json
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.chat.models import Conversation, Message
from apps.crm.models import Contact, Deal
from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppTemplate


def _j(resp):
    resp.render()
    return json.loads(resp.content.decode())


@pytest.fixture
def whatsapp_setup(db):
    account = WhatsAppBusinessAccount.objects.create(
        name="Main",
        waba_id="waba-1",
        access_token="token-1",
        webhook_verify_token="verify-1",
        webhook_secret="secret-1",
    )
    template = WhatsAppTemplate.objects.create(
        account=account,
        name="follow_up",
        category="utility",
        language="es",
        status="approved",
        body_text="Hola {{1}}",
    )
    return {"account": account, "template": template}


@pytest.mark.django_db
def test_send_template_creates_pending_message_and_enqueues_task(admin_user, whatsapp_setup, monkeypatch):
    contact = Contact.objects.create(
        first_name="Cliente",
        last_name="Uno",
        email="cliente1@example.com",
        whatsapp_number="573001112233",
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="WA template deal 1",
        contact=contact,
        source="whatsapp",
        assigned_to=admin_user,
    )
    conv = Conversation.objects.create(
        contact=contact,
        deal=deal,
        channel="whatsapp",
        status="active",
        assigned_to=admin_user,
    )

    enqueued = []

    def fake_delay(message_id, template_id, variables):
        enqueued.append((message_id, template_id, variables))

    monkeypatch.setattr("apps.chat.viewsets.send_whatsapp_template.delay", fake_delay)

    client = APIClient()
    client.force_authenticate(user=admin_user)
    res = client.post(
        f"/api/v1/chat/conversations/{conv.id}/send-template/",
        {"template_id": str(whatsapp_setup["template"].id), "variables": ["Camilo"]},
        format="json",
    )

    assert res.status_code == 201
    body = _j(res)
    message_id = body["data"]["id"]
    msg = Message.objects.get(pk=message_id)
    assert msg.status == "pending"
    assert msg.metadata["template_name"] == "follow_up"
    assert enqueued == [(str(msg.id), str(whatsapp_setup["template"].id), ["Camilo"])]


@pytest.mark.django_db
def test_send_template_rejects_unapproved_template(admin_user, whatsapp_setup):
    template = whatsapp_setup["template"]
    template.status = "pending"
    template.save(update_fields=["status", "updated_at"])

    contact = Contact.objects.create(
        first_name="Cliente",
        last_name="Dos",
        email="cliente2@example.com",
        whatsapp_number="573004445566",
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="WA template deal 2",
        contact=contact,
        source="whatsapp",
        assigned_to=admin_user,
    )
    conv = Conversation.objects.create(
        contact=contact,
        deal=deal,
        channel="whatsapp",
        status="active",
        assigned_to=admin_user,
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)
    res = client.post(
        f"/api/v1/chat/conversations/{conv.id}/send-template/",
        {"template_id": str(template.id), "variables": []},
        format="json",
    )
    assert res.status_code == 400
    assert Message.objects.filter(conversation=conv).count() == 0


@pytest.mark.django_db
def test_whatsapp_text_message_is_blocked_when_24h_window_closed(admin_user):
    contact = Contact.objects.create(
        first_name="Cliente",
        last_name="Tres",
        email="cliente3@example.com",
        whatsapp_number="573007778899",
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="WA text blocked deal",
        contact=contact,
        source="whatsapp",
        assigned_to=admin_user,
    )
    conv = Conversation.objects.create(
        contact=contact,
        deal=deal,
        channel="whatsapp",
        status="active",
        assigned_to=admin_user,
        customer_service_window_expires=timezone.now() - timedelta(minutes=1),
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)
    res = client.post(
        f"/api/v1/chat/conversations/{conv.id}/messages/",
        {"content": "hola libre", "message_type": "text"},
        format="json",
    )
    assert res.status_code == 400
    msg = Message.objects.get(conversation=conv)
    assert msg.status == "failed"
    assert (msg.metadata or {}).get("error") == "WHATSAPP_WINDOW_CLOSED"

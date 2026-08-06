"""Tests for chat REST API."""

import json
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.utils import timezone
from rest_framework.test import APIClient

from apps.chat.models import Conversation, Message
from apps.crm.models import Contact, Deal
from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber


def _j(resp):
    resp.render()
    return json.loads(resp.content.decode())


@pytest.mark.django_db
def test_create_internal_conversation_and_message(admin_user):
    """Create conversation and post agent message (internal channel)."""
    contact = Contact.objects.create(
        first_name="Chat",
        last_name="User",
        email="chatuser@example.com",
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="Chat user primary deal",
        contact=contact,
        assigned_to=admin_user,
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    cres = client.post(
        "/api/v1/chat/conversations/",
        {"deal": str(deal.id), "channel": "internal"},
        format="json",
    )
    assert cres.status_code in (200, 201)
    body = _j(cres)
    cid = body["data"]["id"]
    mres = client.post(
        f"/api/v1/chat/conversations/{cid}/messages/",
        {"content": "Hola", "message_type": "text"},
        format="json",
    )
    assert mres.status_code == 201
    assert Message.objects.filter(conversation_id=cid).count() == 1


@pytest.mark.django_db
def test_toggle_ai(admin_user):
    """Toggle AI flag on conversation."""
    contact = Contact.objects.create(
        first_name="A",
        last_name="I",
        email="ai@example.com",
        created_by=admin_user,
    )
    deal = Deal.objects.create(title="AI deal", contact=contact, assigned_to=admin_user)
    conv = Conversation.objects.get(deal=deal, channel="internal")
    client = APIClient()
    client.force_authenticate(user=admin_user)
    res = client.post(f"/api/v1/chat/conversations/{conv.id}/toggle-ai/", {}, format="json")
    assert res.status_code == 200
    conv.refresh_from_db()
    assert conv.ai_mode_enabled is True


@pytest.mark.django_db
def test_global_ai_mode_updates_all_conversations_but_individual_toggle_can_override(admin_user):
    contact_a = Contact.objects.create(
        first_name="Global",
        last_name="One",
        email="global1@example.com",
        created_by=admin_user,
    )
    contact_b = Contact.objects.create(
        first_name="Global",
        last_name="Two",
        email="global2@example.com",
        created_by=admin_user,
    )
    deal_a = Deal.objects.create(title="Global Deal A", contact=contact_a, assigned_to=admin_user)
    deal_b = Deal.objects.create(title="Global Deal B", contact=contact_b, assigned_to=admin_user)
    conv_a = Conversation.objects.get(deal=deal_a, channel="internal")
    conv_b = Conversation.objects.get(deal=deal_b, channel="internal")

    client = APIClient()
    client.force_authenticate(user=admin_user)

    global_on = client.post("/api/v1/chat/conversations/ai-mode-global/", {"enabled": True}, format="json")
    assert global_on.status_code == 200
    conv_a.refresh_from_db()
    conv_b.refresh_from_db()
    assert conv_a.ai_mode_enabled is True
    assert conv_b.ai_mode_enabled is True

    toggle_one = client.post(f"/api/v1/chat/conversations/{conv_a.id}/toggle-ai/", {}, format="json")
    assert toggle_one.status_code == 200
    conv_a.refresh_from_db()
    conv_b.refresh_from_db()
    assert conv_a.ai_mode_enabled is False
    assert conv_b.ai_mode_enabled is True


@pytest.mark.django_db
def test_whatsapp_verify_token(monkeypatch):
    """Meta webhook verification handshake."""
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "test-secret")
    c = Client()
    r = c.get(
        "/api/v1/chat/webhooks/whatsapp/",
        {"hub.mode": "subscribe", "hub.verify_token": "test-secret", "hub.challenge": "ok123"},
    )
    assert r.status_code == 200
    assert r.content.decode() == "ok123"


@pytest.mark.django_db
def test_deal_creation_auto_creates_internal_conversation(admin_user):
    contact = Contact.objects.create(
        first_name="Auto",
        last_name="Chat",
        email="autochat@example.com",
        created_by=admin_user,
        assigned_to=admin_user,
    )
    deal = Deal.objects.create(
        title="Auto Deal Chat",
        contact=contact,
        assigned_to=admin_user,
    )
    assert Conversation.objects.filter(contact=contact, deal=deal, channel="internal", is_active=True).exists()


@pytest.mark.django_db
def test_conversation_filters_by_deal_stage_and_responsible(admin_user):
    contact_a = Contact.objects.create(
        first_name="Lead",
        last_name="One",
        email="lead1@example.com",
        created_by=admin_user,
        assigned_to=admin_user,
    )
    contact_b = Contact.objects.create(
        first_name="Lead",
        last_name="Two",
        email="lead2@example.com",
        created_by=admin_user,
        assigned_to=admin_user,
    )
    deal_a = Deal.objects.create(
        title="Deal One",
        contact=contact_a,
        stage="new_lead",
        assigned_to=admin_user,
    )
    deal_b = Deal.objects.create(
        title="Deal Two",
        contact=contact_b,
        stage="proposal",
        assigned_to=admin_user,
    )
    conv_a = Conversation.objects.get(deal=deal_a, channel="internal")
    conv_b = Conversation.objects.get(deal=deal_b, channel="internal")

    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get(
        "/api/v1/chat/conversations/",
        {"deal_stage": "new_lead", "responsible": str(admin_user.id)},
    )
    assert response.status_code == 200
    body = _j(response)["data"]
    ids = {row["id"] for row in body["results"]}
    assert str(conv_a.id) in ids
    assert str(conv_b.id) not in ids


@pytest.mark.django_db
def test_send_message_with_attachment(admin_user):
    contact = Contact.objects.create(
        first_name="Adjunto",
        last_name="Chat",
        email="adjunto@example.com",
        created_by=admin_user,
    )
    deal = Deal.objects.create(title="Adjunto deal", contact=contact, assigned_to=admin_user)
    conv = Conversation.objects.get(deal=deal, channel="internal")
    client = APIClient()
    client.force_authenticate(user=admin_user)
    upload = SimpleUploadedFile("prueba.pdf", b"%PDF-1.4 fake", content_type="application/pdf")
    response = client.post(
        f"/api/v1/chat/conversations/{conv.id}/messages/",
        {"content": "Documento de prueba", "message_type": "document", "file": upload},
        format="multipart",
    )
    assert response.status_code == 201
    msg = Message.objects.filter(conversation=conv).order_by("-created_at").first()
    assert msg is not None
    assert msg.attachments.filter(is_active=True).exists()


@pytest.mark.django_db
def test_whatsapp_attachment_rejects_unsupported_image_type(admin_user):
    contact = Contact.objects.create(
        first_name="WA",
        last_name="Image",
        email="waimage@example.com",
        whatsapp_number="573001112233",
        created_by=admin_user,
    )
    deal = Deal.objects.create(title="WA Img", contact=contact, source="whatsapp", assigned_to=admin_user)
    conv, _ = Conversation.objects.get_or_create(contact=contact, deal=deal, channel="whatsapp")
    client = APIClient()
    client.force_authenticate(user=admin_user)
    upload = SimpleUploadedFile("anim.gif", b"GIF89a", content_type="image/gif")
    response = client.post(
        f"/api/v1/chat/conversations/{conv.id}/messages/",
        {"content": "imagen", "message_type": "image", "file": upload},
        format="multipart",
    )
    assert response.status_code == 400
    assert "JPG o PNG" in json.dumps(_j(response), ensure_ascii=False)


@pytest.mark.django_db
def test_whatsapp_attachment_rejects_oversized_image(admin_user):
    contact = Contact.objects.create(
        first_name="WA",
        last_name="Big",
        email="wabig@example.com",
        whatsapp_number="573004445566",
        created_by=admin_user,
    )
    deal = Deal.objects.create(title="WA Big", contact=contact, source="whatsapp", assigned_to=admin_user)
    conv, _ = Conversation.objects.get_or_create(contact=contact, deal=deal, channel="whatsapp")
    client = APIClient()
    client.force_authenticate(user=admin_user)
    # 6 MB > WhatsApp image limit (5 MB)
    payload = b"x" * (6 * 1024 * 1024)
    upload = SimpleUploadedFile("big.jpg", payload, content_type="image/jpeg")
    response = client.post(
        f"/api/v1/chat/conversations/{conv.id}/messages/",
        {"content": "imagen grande", "message_type": "image", "file": upload},
        format="multipart",
    )
    assert response.status_code == 400
    assert "5 MB" in json.dumps(_j(response), ensure_ascii=False)


@pytest.mark.django_db
def test_create_whatsapp_conversation_reuses_legacy_contact_thread_with_history(admin_user):
    contact = Contact.objects.create(
        first_name="Legacy",
        last_name="WhatsApp",
        email="legacywa@example.com",
        whatsapp_number="573001231231",
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="Legacy WA Deal",
        contact=contact,
        source="whatsapp",
        assigned_to=admin_user,
    )
    legacy_conv = Conversation.objects.create(
        contact=contact,
        deal=None,
        channel="whatsapp",
        status="archived",
        assigned_to=admin_user,
        last_inbound_message_at=timezone.now() - timedelta(hours=3),
        customer_service_window_expires=timezone.now() - timedelta(hours=1),
    )
    Message.objects.create(
        conversation=legacy_conv,
        sender_type="contact",
        content="Histórico real",
        whatsapp_message_id="wamid-legacy-thread",
        status="delivered",
    )
    empty_deal_conv = Conversation.objects.create(
        contact=contact,
        deal=deal,
        channel="whatsapp",
        status="archived",
        assigned_to=admin_user,
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.post(
        "/api/v1/chat/conversations/",
        {"deal": str(deal.id), "contact": str(contact.id), "channel": "whatsapp"},
        format="json",
    )
    assert response.status_code in (200, 201)
    data = _j(response)["data"]
    assert str(data["id"]) == str(legacy_conv.id)

    legacy_conv.refresh_from_db()
    empty_deal_conv.refresh_from_db()
    assert legacy_conv.deal_id == deal.id
    assert empty_deal_conv.is_active is False

    history = client.get(f"/api/v1/chat/conversations/{legacy_conv.id}/messages/")
    assert history.status_code == 200
    payload = _j(history)["data"]["results"]
    assert len(payload) == 1
    assert payload[0]["content"] == "Histórico real"


@pytest.mark.django_db
def test_conversation_filters_by_whatsapp_phone_number(admin_user):
    account = WhatsAppBusinessAccount.objects.create(
        name="Main",
        waba_id="waba-filter",
        access_token="token-filter",
        webhook_verify_token="verify-filter",
    )
    phone_a = WhatsAppPhoneNumber.objects.create(
        account=account,
        phone_number_id="pn-a",
        display_phone_number="+57 300 000 0001",
        internal_name="Línea A",
        status="connected",
        is_default=True,
    )
    phone_b = WhatsAppPhoneNumber.objects.create(
        account=account,
        phone_number_id="pn-b",
        display_phone_number="+57 300 000 0002",
        internal_name="Línea B",
        status="connected",
    )
    contact_a = Contact.objects.create(
        first_name="Linea",
        last_name="Uno",
        email="linea1@example.com",
        whatsapp_number="573001111111",
        created_by=admin_user,
    )
    contact_b = Contact.objects.create(
        first_name="Linea",
        last_name="Dos",
        email="linea2@example.com",
        whatsapp_number="573002222222",
        created_by=admin_user,
    )
    deal_a = Deal.objects.create(title="Deal Línea A", contact=contact_a, source="whatsapp", assigned_to=admin_user)
    deal_b = Deal.objects.create(title="Deal Línea B", contact=contact_b, source="whatsapp", assigned_to=admin_user)
    conv_a, _ = Conversation.objects.get_or_create(contact=contact_a, deal=deal_a, channel="whatsapp", defaults={"whatsapp_phone_number": phone_a})
    conv_b, _ = Conversation.objects.get_or_create(contact=contact_b, deal=deal_b, channel="whatsapp", defaults={"whatsapp_phone_number": phone_b})
    conv_a.whatsapp_phone_number = phone_a
    conv_a.customer_service_window_expires = timezone.now() + timedelta(hours=2)
    conv_a.save(update_fields=["whatsapp_phone_number", "customer_service_window_expires", "updated_at"])
    conv_b.whatsapp_phone_number = phone_b
    conv_b.customer_service_window_expires = timezone.now() + timedelta(hours=2)
    conv_b.save(update_fields=["whatsapp_phone_number", "customer_service_window_expires", "updated_at"])

    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get("/api/v1/chat/conversations/", {"channel": "whatsapp", "whatsapp_phone_number": str(phone_a.id)})
    assert response.status_code == 200
    body = _j(response)["data"]
    ids = {row["id"] for row in body["results"]}
    assert str(conv_a.id) in ids
    assert str(conv_b.id) not in ids
    row = next(item for item in body["results"] if item["id"] == str(conv_a.id))
    assert row["whatsapp_line_name"] == "Línea A"


@pytest.mark.django_db
def test_whatsapp_conversation_filters_only_real_whatsapp_origin_and_real_window_state(admin_user):
    now = timezone.now()

    contact_open = Contact.objects.create(
        first_name="WA",
        last_name="Open",
        email="waopen@example.com",
        whatsapp_number="573001230001",
        created_by=admin_user,
        source="whatsapp",
    )
    deal_open = Deal.objects.create(
        title="WA Open",
        contact=contact_open,
        source="whatsapp",
        assigned_to=admin_user,
    )
    conv_open, _ = Conversation.objects.get_or_create(contact=contact_open, deal=deal_open, channel="whatsapp")
    conv_open.customer_service_window_expires = now + timedelta(hours=3)
    conv_open.status = "active"
    conv_open.save(update_fields=["customer_service_window_expires", "status", "updated_at"])

    contact_closed = Contact.objects.create(
        first_name="WA",
        last_name="Closed",
        email="waclosed@example.com",
        whatsapp_number="573001230002",
        created_by=admin_user,
        source="whatsapp",
    )
    deal_closed = Deal.objects.create(
        title="WA Closed",
        contact=contact_closed,
        source="whatsapp",
        assigned_to=admin_user,
    )
    conv_closed, _ = Conversation.objects.get_or_create(contact=contact_closed, deal=deal_closed, channel="whatsapp")
    conv_closed.customer_service_window_expires = now - timedelta(minutes=10)
    conv_closed.status = "active"
    conv_closed.save(update_fields=["customer_service_window_expires", "status", "updated_at"])

    contact_workana = Contact.objects.create(
        first_name="Workana",
        last_name="Lead",
        email="workana@example.com",
        whatsapp_number="573001230003",
        created_by=admin_user,
        source="workana",
    )
    deal_workana = Deal.objects.create(
        title="Workana via WhatsApp",
        contact=contact_workana,
        source="workana",
        assigned_to=admin_user,
    )
    conv_workana, _ = Conversation.objects.get_or_create(contact=contact_workana, deal=deal_workana, channel="whatsapp")
    conv_workana.customer_service_window_expires = now + timedelta(hours=2)
    conv_workana.status = "active"
    conv_workana.save(update_fields=["customer_service_window_expires", "status", "updated_at"])

    contact_manual = Contact.objects.create(
        first_name="Manual",
        last_name="Lead",
        email="manual@example.com",
        whatsapp_number="573001230004",
        created_by=admin_user,
        source="manual",
    )
    deal_manual = Deal.objects.create(
        title="Manual no inbound",
        contact=contact_manual,
        source="manual",
        assigned_to=admin_user,
    )
    conv_manual, _ = Conversation.objects.get_or_create(contact=contact_manual, deal=deal_manual, channel="whatsapp")
    conv_manual.customer_service_window_expires = None
    conv_manual.last_inbound_message_at = None
    conv_manual.status = "active"
    conv_manual.save(update_fields=["customer_service_window_expires", "last_inbound_message_at", "status", "updated_at"])

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response_open = client.get("/api/v1/chat/conversations/", {"channel": "whatsapp", "whatsapp_window_status": "open"})
    assert response_open.status_code == 200
    body_open = _j(response_open)["data"]
    open_ids = {row["id"] for row in body_open["results"]}
    assert str(conv_open.id) in open_ids
    assert str(conv_closed.id) not in open_ids
    assert str(conv_workana.id) in open_ids
    assert str(conv_manual.id) not in open_ids
    open_row = next(row for row in body_open["results"] if row["id"] == str(conv_open.id))
    open_workana_row = next(row for row in body_open["results"] if row["id"] == str(conv_workana.id))
    assert open_row["is_whatsapp_origin"] is True
    assert open_row["is_whatsapp_window_closed"] is False
    assert open_row["latest_deal_source"] == "whatsapp"
    assert open_workana_row["is_whatsapp_origin"] is False
    assert open_workana_row["is_whatsapp_window_closed"] is False
    assert open_workana_row["latest_deal_source"] == "workana"

    response_closed = client.get("/api/v1/chat/conversations/", {"channel": "whatsapp", "whatsapp_window_status": "closed"})
    assert response_closed.status_code == 200
    body_closed = _j(response_closed)["data"]
    closed_ids = {row["id"] for row in body_closed["results"]}
    assert str(conv_open.id) not in closed_ids
    assert str(conv_closed.id) in closed_ids
    assert str(conv_workana.id) not in closed_ids
    assert str(conv_manual.id) not in closed_ids
    closed_row = next(row for row in body_closed["results"] if row["id"] == str(conv_closed.id))
    assert closed_row["is_whatsapp_origin"] is True
    assert closed_row["is_whatsapp_window_closed"] is True


@pytest.mark.django_db
def test_whatsapp_closed_conversation_uses_historical_thread_messages_when_legacy_empty_duplicate_exists(admin_user):
    now = timezone.now()
    contact = Contact.objects.create(
        first_name="Legacy",
        last_name="Closed",
        email="legacyclosed@example.com",
        whatsapp_number="573001230099",
        created_by=admin_user,
        source="whatsapp",
    )
    deal = Deal.objects.create(
        title="Legacy Closed Deal",
        contact=contact,
        source="whatsapp",
        assigned_to=admin_user,
    )
    history_conv = Conversation.objects.create(
        contact=contact,
        deal=None,
        channel="whatsapp",
        status="archived",
        is_active=True,
        customer_service_window_expires=now - timedelta(hours=2),
        last_inbound_message_at=now - timedelta(hours=3),
        last_message_at=now - timedelta(hours=2, minutes=50),
    )
    Message.objects.create(
        conversation=history_conv,
        sender_type="contact",
        content="Necesito más información del servicio",
        message_type="text",
        status="delivered",
    )
    empty_duplicate = Conversation.objects.create(
        contact=contact,
        deal=deal,
        channel="whatsapp",
        status="archived",
        is_active=True,
        customer_service_window_expires=now - timedelta(hours=1),
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get(f"/api/v1/chat/conversations/{empty_duplicate.id}/messages/")

    assert response.status_code == 200
    body = _j(response)["data"]
    assert body["count"] == 1
    assert body["results"][0]["content"] == "Necesito más información del servicio"

    history_conv.refresh_from_db()
    assert history_conv.deal_id == deal.id

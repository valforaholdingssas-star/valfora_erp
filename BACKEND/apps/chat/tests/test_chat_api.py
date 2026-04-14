"""Tests for chat REST API."""

import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from rest_framework.test import APIClient

from apps.chat.models import Conversation, Message
from apps.crm.models import Contact, Deal


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

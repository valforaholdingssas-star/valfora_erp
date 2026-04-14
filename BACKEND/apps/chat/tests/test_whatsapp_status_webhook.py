"""WhatsApp delivery status webhook updates Message rows."""

import json

import pytest
from django.test import Client

from apps.chat.models import Message
from apps.crm.models import Contact


@pytest.mark.django_db
def test_status_webhook_updates_message_status(monkeypatch, admin_user):
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "")
    contact = Contact.objects.create(
        first_name="S",
        last_name="T",
        email="st@example.com",
        created_by=admin_user,
    )
    from apps.chat.models import Conversation

    conv = Conversation.objects.create(contact=contact, channel="whatsapp", assigned_to=admin_user)
    msg = Message.objects.create(
        conversation=conv,
        sender_type="user",
        content="Hola",
        message_type="text",
        whatsapp_message_id="wamid-STATUS-1",
        status="sent",
    )
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "0",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {},
                            "statuses": [
                                {
                                    "id": "wamid-STATUS-1",
                                    "status": "read",
                                    "timestamp": "123",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }
    c = Client()
    r = c.post(
        "/api/v1/chat/webhooks/whatsapp/",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert r.status_code == 200
    msg.refresh_from_db()
    assert msg.status == "read"

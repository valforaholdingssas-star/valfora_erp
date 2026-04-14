"""Tests for webhook async payload processor."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.chat.models import Conversation, Message
from apps.crm.models import Contact
from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber
from apps.whatsapp.services.webhook_processor import process_webhook_payload


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
        phone_number_id="pn-123",
        display_phone_number="+57 300 000 0000",
        status="connected",
        is_default=True,
    )


@pytest.mark.django_db
def test_process_webhook_payload_creates_contact_conversation_and_message(wa_phone):
    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "metadata": {"phone_number_id": wa_phone.phone_number_id},
                            "contacts": [{"wa_id": "573001112233", "profile": {"name": "Cliente Uno"}}],
                            "messages": [
                                {
                                    "id": "wamid-1",
                                    "from": "573001112233",
                                    "type": "text",
                                    "text": {"body": "Hola desde WA"},
                                }
                            ],
                        }
                    }
                ]
            }
        ]
    }

    process_webhook_payload(payload)

    contact = Contact.objects.get(whatsapp_number="573001112233")
    conv = Conversation.objects.get(contact=contact, channel="whatsapp")
    msg = Message.objects.get(conversation=conv, whatsapp_message_id="wamid-1")

    assert msg.content == "Hola desde WA"
    assert msg.sender_type == "contact"
    assert msg.status == "delivered"
    assert conv.unread_count == 1
    assert conv.whatsapp_phone_number_id == wa_phone.id
    assert conv.last_inbound_message_at is not None
    assert conv.customer_service_window_expires is not None
    assert conv.customer_service_window_expires > timezone.now() + timedelta(hours=23, minutes=59)


@pytest.mark.django_db
def test_process_webhook_payload_ignores_duplicate_inbound_message(wa_phone):
    contact = Contact.objects.create(
        first_name="Cliente",
        last_name="Dos",
        email="cliente2@example.com",
        whatsapp_number="573009998877",
    )
    conv = Conversation.objects.create(
        contact=contact,
        channel="whatsapp",
        status="active",
        whatsapp_phone_number=wa_phone,
    )
    Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Previo",
        whatsapp_message_id="wamid-dup",
        status="delivered",
    )

    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "metadata": {"phone_number_id": wa_phone.phone_number_id},
                            "contacts": [{"wa_id": "573009998877", "profile": {"name": "Cliente Dos"}}],
                            "messages": [
                                {
                                    "id": "wamid-dup",
                                    "from": "573009998877",
                                    "type": "text",
                                    "text": {"body": "Repetido"},
                                }
                            ],
                        }
                    }
                ]
            }
        ]
    }

    process_webhook_payload(payload)
    assert Message.objects.filter(whatsapp_message_id="wamid-dup").count() == 1


@pytest.mark.django_db
def test_process_webhook_payload_updates_message_status_from_status_events():
    contact = Contact.objects.create(
        first_name="Cliente",
        last_name="Tres",
        email="cliente3@example.com",
    )
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", status="active")
    msg = Message.objects.create(
        conversation=conv,
        sender_type="user",
        content="Hola",
        whatsapp_message_id="wamid-status-1",
        status="sent",
    )

    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "statuses": [{"id": "wamid-status-1", "status": "read", "timestamp": "1710000000"}],
                        }
                    }
                ]
            }
        ]
    }

    process_webhook_payload(payload)
    msg.refresh_from_db()

    assert msg.status == "read"
    assert (msg.metadata or {}).get("last_status_event", {}).get("status") == "read"

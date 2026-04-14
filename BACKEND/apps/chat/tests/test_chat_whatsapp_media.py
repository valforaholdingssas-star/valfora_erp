"""Inbound WhatsApp media stored as messages."""

from unittest.mock import patch

import pytest

from apps.chat.models import Message
from apps.chat.services import create_inbound_whatsapp_message
from apps.crm.models import Contact


@pytest.mark.django_db
@patch("apps.chat.tasks.fetch_whatsapp_media_for_message.delay")
def test_create_inbound_image_message(mock_media_delay, admin_user):
    contact = Contact.objects.create(
        first_name="Media",
        last_name="User",
        email="media@example.com",
        whatsapp_number="573001234567",
        created_by=admin_user,
    )
    msg = create_inbound_whatsapp_message(
        wa_message_id="wamid-img-1",
        from_phone="573001234567",
        body="Foto del producto",
        raw_payload={"type": "image", "image": {"id": "123"}},
        message_type="image",
    )
    assert msg is not None
    assert msg.message_type == "image"
    assert "Foto" in msg.content
    assert Message.objects.filter(whatsapp_message_id="wamid-img-1").count() == 1

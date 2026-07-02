"""Inbound WhatsApp media stored as messages."""

from unittest.mock import patch

from apps.chat.models import Conversation, Message, MessageAttachment
from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber

import pytest

from apps.chat.services import create_inbound_whatsapp_message
from apps.chat.tasks import fetch_whatsapp_media_for_message
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


@pytest.mark.django_db
@patch("apps.chat.tasks.services.download_whatsapp_media_binary")
def test_fetch_whatsapp_media_uses_conversation_phone_credentials(mock_download, admin_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    account = WhatsAppBusinessAccount.objects.create(
        name="Main",
        waba_id="waba-media-1",
        access_token="token-media-1",
        webhook_verify_token="verify-1",
        webhook_secret="secret-1",
    )
    phone = WhatsAppPhoneNumber.objects.create(
        account=account,
        phone_number_id="pn-media-1",
        display_phone_number="+57 300 000 1111",
        status="connected",
        is_default=True,
    )
    contact = Contact.objects.create(
        first_name="Media",
        last_name="Owner",
        email="owner@example.com",
        whatsapp_number="573001234567",
        created_by=admin_user,
    )
    conversation = Conversation.objects.create(
        contact=contact,
        channel="whatsapp",
        status="active",
        whatsapp_phone_number=phone,
    )
    message = Message.objects.create(
        conversation=conversation,
        sender_type="contact",
        content="[Imagen]",
        message_type="image",
        whatsapp_message_id="wamid-media-task-1",
        status="delivered",
    )
    mock_download.return_value = (b"image-bytes", "image/png")

    fetch_whatsapp_media_for_message(str(message.id), "media-123")

    mock_download.assert_called_once()
    assert mock_download.call_args.kwargs["phone_number"] == phone
    message.refresh_from_db()
    attachment = MessageAttachment.objects.get(message=message)
    assert attachment.file_type == "image/png"
    assert message.metadata.get("media_downloaded") is True


@pytest.mark.django_db
@patch("apps.chat.tasks.services.download_whatsapp_media_binary")
def test_fetch_whatsapp_media_persists_error_when_download_fails(mock_download, admin_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    contact = Contact.objects.create(
        first_name="Media",
        last_name="Error",
        email="media-error@example.com",
        whatsapp_number="573009999999",
        created_by=admin_user,
    )
    conversation = Conversation.objects.create(
        contact=contact,
        channel="whatsapp",
        status="active",
    )
    message = Message.objects.create(
        conversation=conversation,
        sender_type="contact",
        content="[Imagen]",
        message_type="image",
        whatsapp_message_id="wamid-media-task-err",
        status="delivered",
    )
    mock_download.side_effect = RuntimeError("token invalid")

    fetch_whatsapp_media_for_message(str(message.id), "media-err")

    message.refresh_from_db()
    assert message.metadata.get("media_download_error") == "token invalid"

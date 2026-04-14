"""WebSocket auth tests for chat consumers."""

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from rest_framework_simplejwt.tokens import RefreshToken

from apps.chat.models import Conversation
from apps.crm.models import Contact, Deal
from config.asgi import application


@pytest.mark.django_db
def test_chat_websocket_rejects_without_token(admin_user):
    contact = Contact.objects.create(
        first_name="Ws",
        last_name="Test",
        email="wstest@example.com",
        created_by=admin_user,
    )
    deal = Deal.objects.create(title="WS deal 1", contact=contact, assigned_to=admin_user)
    conv = Conversation.objects.get(deal=deal, channel="internal")
    conv.assigned_to = admin_user
    conv.save(update_fields=["assigned_to", "updated_at"])

    async def _run():
        communicator = WebsocketCommunicator(application, f"/ws/chat/{conv.id}/")
        connected, _ = await communicator.connect()
        assert connected is False
        await communicator.disconnect()

    async_to_sync(_run)()


@pytest.mark.django_db
def test_chat_websocket_accepts_valid_token(admin_user):
    contact = Contact.objects.create(
        first_name="Ws2",
        last_name="Test",
        email="wstest2@example.com",
        created_by=admin_user,
    )
    deal = Deal.objects.create(title="WS deal 2", contact=contact, assigned_to=admin_user)
    conv = Conversation.objects.get(deal=deal, channel="internal")
    conv.assigned_to = admin_user
    conv.save(update_fields=["assigned_to", "updated_at"])
    refresh = RefreshToken.for_user(admin_user)
    access = str(refresh.access_token)
    url = f"/ws/chat/{conv.id}/?token={access}"

    async def _run():
        communicator = WebsocketCommunicator(application, url)
        connected, _ = await communicator.connect()
        assert connected is True
        await communicator.disconnect()

    async_to_sync(_run)()

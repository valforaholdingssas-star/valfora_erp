"""WebSocket consumers for chat and user notifications."""

import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.rbac import user_has_module_permission
from apps.chat.models import Conversation

User = get_user_model()


@database_sync_to_async
def get_user_from_token(token: str):
    """Resolve user from JWT access token string."""
    try:
        access = AccessToken(token)
        uid = access["user_id"]
        return User.objects.get(pk=uid)
    except (TokenError, InvalidToken, User.DoesNotExist, KeyError):
        return None


@database_sync_to_async
def user_can_access_conversation(user, conversation_id: str) -> bool:
    """Check CRM/chat access for conversation."""
    if not user or not user.is_authenticated:
        return False
    if not user_has_module_permission(user, "chat", "view"):
        return False
    try:
        conv = Conversation.objects.select_related("contact").get(pk=conversation_id, is_active=True)
    except Conversation.DoesNotExist:
        return False
    if getattr(user, "role", None) in {"super_admin", "admin"}:
        return True
    if conv.assigned_to_id and str(conv.assigned_to_id) == str(user.id):
        return True
    if conv.contact.assigned_to_id and str(conv.contact.assigned_to_id) == str(user.id):
        return True
    return False


class ChatConsumer(AsyncWebsocketConsumer):
    """Subscribe to messages for one conversation."""

    async def connect(self):
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        token = (qs.get("token") or [None])[0]
        user = await get_user_from_token(token) if token else None
        if not user:
            await self.close(code=4401)
            return
        if not await user_can_access_conversation(user, self.conversation_id):
            await self.close(code=4403)
            return
        self.user = user
        self.group_name = f"chat_conversation_{self.conversation_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
        if data.get("type") != "typing":
            return
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat.typing",
                "payload": {
                    "event": "typing",
                    "conversation_id": self.conversation_id,
                    "typing": bool(data.get("typing")),
                    "user_id": str(self.user.pk),
                },
            },
        )

    async def chat_event(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    async def chat_typing(self, event):
        """Broadcast typing indicator to other subscribers."""
        await self.send(text_data=json.dumps(event["payload"]))


class UserNotifyConsumer(AsyncWebsocketConsumer):
    """Lightweight feed for assigned user (sidebar refresh hints)."""

    async def connect(self):
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        token = (qs.get("token") or [None])[0]
        user = await get_user_from_token(token) if token else None
        if not user:
            await self.close(code=4401)
            return
        self.user_id = str(user.pk)
        self.group_name = f"chat_user_{self.user_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def chat_event(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

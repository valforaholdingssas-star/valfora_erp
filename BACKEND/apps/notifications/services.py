"""Create notifications and push to WebSocket groups."""

from __future__ import annotations

from typing import TYPE_CHECKING

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.cache import cache

from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer

if TYPE_CHECKING:
    from apps.chat.models import Message


def _recipient_ids_for_inbound_message(conv) -> list:
    """Users to notify when a contact sends a message."""
    ids: set = set()
    if conv.assigned_to_id:
        ids.add(conv.assigned_to_id)
    contact = conv.contact
    if getattr(contact, "assigned_to_id", None) and contact.assigned_to_id not in ids:
        ids.add(contact.assigned_to_id)
    return list(ids)


def notify_inbound_chat_message(message: "Message") -> None:
    """
    Persist Notification rows and push to chat_user_<id> for inbox updates.

    Only for messages from the contact (not staff/AI).
    """
    if message.sender_type != "contact":
        return

    from apps.chat.models import Conversation

    try:
        conv = Conversation.objects.select_related("contact", "contact__assigned_to").get(
            pk=message.conversation_id,
            is_active=True,
        )
    except Conversation.DoesNotExist:
        return

    recipient_ids = _recipient_ids_for_inbound_message(conv)
    if not recipient_ids:
        return

    contact = conv.contact
    title = f"Nuevo mensaje · {contact.first_name} {contact.last_name}".strip()
    body = (message.content or "").strip()[:500]
    action_url = f"/chat/contact/{contact.id}"

    layer = get_channel_layer()
    for uid in recipient_ids:
        n = Notification.objects.create(
            recipient_id=uid,
            notification_type="chat_message",
            title=title,
            message=body,
            action_url=action_url,
            related_object_type="Conversation",
            related_object_id=conv.id,
        )
        payload = {
            "event": "notification.created",
            "notification": NotificationSerializer(n).data,
        }
        event = {"type": "chat.event", "payload": payload}
        if layer:
            async_to_sync(layer.group_send)(f"chat_user_{uid}", event)
        cache.delete(f"platform_dashboard:{uid}")

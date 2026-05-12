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


def notify_inbound_linkedin_message(*, prospect, message_text: str = "") -> None:
    """
    Persist + push a LinkedIn inbound notification through ws/user.

    Uses existing notification_type=chat_message to avoid introducing a new enum
    and keep compatibility with current frontend notification center.
    """
    account = getattr(prospect, "account", None)
    if not account or not getattr(account, "user_id", None):
        return

    recipient_id = account.user_id
    title = f"Nuevo mensaje LinkedIn · {prospect.full_name}".strip()
    body = (message_text or "").strip()[:500]
    action_url = f"/settings/linkedin?prospect={prospect.id}"

    n = Notification.objects.create(
        recipient_id=recipient_id,
        notification_type="chat_message",
        title=title,
        message=body,
        action_url=action_url,
        related_object_type="LinkedInProspect",
        related_object_id=prospect.id,
    )

    unread_count = prospect.__class__.objects.filter(
        account=account,
        is_active=True,
        last_message_direction="inbound",
        last_message_at__isnull=False,
    ).count()

    layer = get_channel_layer()
    if layer:
        preview = body[:100]
        async_to_sync(layer.group_send)(
            f"chat_user_{recipient_id}",
            {
                "type": "chat.event",
                "payload": {
                    "event": "notification.created",
                    "notification": NotificationSerializer(n).data,
                },
            },
        )
        # Contract-compatible event payload requested by LinkedIn integration plan.
        async_to_sync(layer.group_send)(
            f"chat_user_{recipient_id}",
            {
                "type": "chat.event",
                "payload": {
                    "type": "linkedin_message",
                    "prospect_id": str(prospect.id),
                    "prospect_name": prospect.full_name,
                    "message_preview": preview,
                    "timestamp": n.created_at.isoformat(),
                },
            },
        )
        async_to_sync(layer.group_send)(
            f"chat_user_{recipient_id}",
            {
                "type": "chat.event",
                "payload": {
                    "event": "linkedin.message.created",
                    "prospect_id": str(prospect.id),
                    "account_id": str(account.id),
                    "unread_count": unread_count,
                },
            },
        )

    cache.delete(f"platform_dashboard:{recipient_id}")

"""Signals: WebSocket broadcast on new messages."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from apps.chat.handoff import text_requests_human_handoff
from apps.chat.models import Conversation, Message
from apps.chat.serializers import MessageSerializer
from apps.notifications.services import notify_inbound_chat_message
from apps.ai_config.runtime import resolve_global_ai_mode_enabled


def _to_channel_safe(value):
    """Convert payload values to msgpack-serializable primitives for channels_redis."""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _to_channel_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_to_channel_safe(v) for v in value]
    return value


@receiver(post_save, sender=Message)
def detect_handoff_from_contact_text(sender, instance: Message, created: bool, **kwargs) -> None:
    """Marca la conversación si el contacto pide explícitamente un humano."""
    if not created or instance.sender_type != "contact":
        return
    if text_requests_human_handoff(instance.content or ""):
        Conversation.objects.filter(pk=instance.conversation_id).update(
            human_handoff_requested=True,
            human_handoff_at=timezone.now(),
        )


@receiver(post_save, sender=Message)
def broadcast_new_chat_message(sender, instance: Message, created: bool, **kwargs) -> None:
    """Push new messages to Channels groups and refresh conversation ordering."""
    layer = get_channel_layer()
    if layer is None:
        return

    if created:
        Conversation.objects.filter(pk=instance.conversation_id).update(
            last_message_at=instance.created_at,
            updated_at=timezone.now(),
        )

    payload = _to_channel_safe(MessageSerializer(instance).data)
    evt = "message.created" if created else "message.updated"
    event = {
        "type": "chat.event",
        "payload": {"event": evt, "message": payload},
    }
    async_to_sync(layer.group_send)(f"chat_conversation_{instance.conversation_id}", event)

    if not created:
        return

    conv = Conversation.objects.get(pk=instance.conversation_id)
    if conv.assigned_to_id:
        async_to_sync(layer.group_send)(
            f"chat_user_{conv.assigned_to_id}",
            {
                "type": "chat.event",
                "payload": {
                    "event": "conversation.updated",
                    "conversation_id": str(conv.id),
                    "unread_count": conv.unread_count,
                },
            },
        )

    notify_inbound_chat_message(instance)


@receiver(post_save, sender=Message)
def enqueue_ai_reply_after_contact_message(
    sender,
    instance: Message,
    created: bool,
    **kwargs,
) -> None:
    """Queue LLM reply when a contact message arrives and AI mode is on."""
    if not created:
        return
    if instance.sender_type != "contact" or instance.is_ai_generated:
        return
    conv = (
        Conversation.objects.only("ai_mode_enabled", "human_handoff_requested")
        .filter(pk=instance.conversation_id)
        .first()
    )
    if not conv or (not conv.ai_mode_enabled and not resolve_global_ai_mode_enabled()) or conv.human_handoff_requested:
        return

    def _enqueue() -> None:
        from apps.chat.tasks import generate_ai_reply_for_message

        generate_ai_reply_for_message.delay(str(instance.id))

    transaction.on_commit(_enqueue)

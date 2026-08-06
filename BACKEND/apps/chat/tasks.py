"""Celery tasks for chat / WhatsApp."""

import logging

from celery import shared_task
from django.utils import timezone

from apps.ai_config.quota import get_conversation_token_usage_today, try_reserve_conversation_tokens
from apps.ai_config.services import (
    CompletionResult,
    build_openai_messages,
    generate_chat_completion,
    resolve_ai_configuration_for_conversation,
    moderate_openai_text,
)
from apps.calendar_app.booking_ai import (
    contains_external_booking_link,
    is_google_calendar_ready,
    maybe_handle_calendar_booking,
    offer_availability_slots,
)
from django.core.files.base import ContentFile

from apps.chat import services
from apps.chat.ai_reply_guard import (
    acquire_conversation_ai_lock,
    has_ai_reply_after,
    is_latest_contact_message,
    latest_contact_message,
    release_conversation_ai_lock,
)
from apps.chat.models import Conversation, Message, MessageAttachment

logger = logging.getLogger(__name__)


def _quota_exceeded_message() -> str:
    return (
        "Hemos alcanzado el límite diario de asistencia automática para esta conversación. "
        "Un asesor te contactará pronto."
    )


def _moderation_blocked_message() -> str:
    return (
        "No puedo enviar esa respuesta automáticamente. "
        "Un asesor humano revisará tu caso."
    )


def _usage_dict(result: CompletionResult) -> dict:
    return {
        "prompt_tokens": result.prompt_tokens,
        "completion_tokens": result.completion_tokens,
        "total_tokens": result.total_tokens,
    }


def _enqueue_whatsapp_if_needed(conv: Conversation, reply: Message) -> None:
    if conv.channel == "whatsapp":
        send_whatsapp_outbound.delay(str(reply.id))


def _should_persist_ai_reply(inbound: Message, *, exclude_reply_id: str | None = None) -> bool:
    return is_latest_contact_message(inbound) and not has_ai_reply_after(
        inbound,
        exclude_id=exclude_reply_id,
    )


@shared_task(bind=True, name="chat.tasks.generate_ai_reply_for_message")
def generate_ai_reply_for_message(self, inbound_message_id: str) -> None:
    """Generate an AI reply for an inbound contact message (Celery)."""
    try:
        inbound = Message.objects.select_related("conversation", "conversation__ai_configuration").get(
            pk=inbound_message_id,
        )
    except Message.DoesNotExist:
        return
    conv = inbound.conversation
    conv.refresh_from_db()
    if conv.human_handoff_requested:
        logger.info("Skipping AI reply: human handoff requested for conversation %s", conv.id)
        return
    # Global AI mode is a bulk setter for conversations, not a permanent override.
    if not conv.ai_mode_enabled:
        return
    if inbound.sender_type != "contact" or inbound.is_ai_generated:
        return

    # Coalesce bursts: only the latest contact message should answer.
    if not is_latest_contact_message(inbound):
        logger.info(
            "Skipping AI reply for stale inbound %s (newer contact message exists) conv=%s",
            inbound.id,
            conv.id,
        )
        return
    if has_ai_reply_after(inbound):
        logger.info("Skipping AI reply: already answered after inbound %s", inbound.id)
        return

    lock_owner = str(inbound_message_id)
    if not acquire_conversation_ai_lock(str(conv.id), owner=lock_owner):
        retries = int(getattr(self.request, "retries", 0) or 0)
        if retries < 3:
            logger.info("AI reply lock busy for conv %s; retrying inbound %s", conv.id, inbound.id)
            raise self.retry(countdown=5, max_retries=3)
        logger.warning("AI reply lock busy for conv %s; dropping inbound %s after retries", conv.id, inbound.id)
        return

    try:
        latest = latest_contact_message(conv.id)
        if not latest or str(latest.id) != str(inbound.id):
            logger.info("Skipping AI reply after lock: inbound %s is no longer latest", inbound.id)
            return
        if has_ai_reply_after(inbound):
            return

        _generate_ai_reply_locked(inbound=inbound, conv=conv)
    finally:
        release_conversation_ai_lock(str(conv.id), owner=lock_owner)


def _generate_ai_reply_locked(*, inbound: Message, conv: Conversation) -> None:
    config = resolve_ai_configuration_for_conversation(conv)
    if not config:
        logger.warning("ai_mode_enabled but no default AIConfiguration row")
        return

    calendar_reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    if calendar_reply:
        # Exclude the reply we just created; otherwise has_ai_reply_after always matches itself
        # and soft-deletes every calendar offer without sending it to WhatsApp.
        if not _should_persist_ai_reply(inbound, exclude_reply_id=str(calendar_reply.id)):
            Message.objects.filter(pk=calendar_reply.pk).update(is_active=False, updated_at=timezone.now())
            latest = latest_contact_message(conv.id)
            if latest and str(latest.id) != str(inbound.id):
                generate_ai_reply_for_message.delay(str(latest.id))
            return
        _enqueue_whatsapp_if_needed(conv, calendar_reply)
        return

    budget = int(config.daily_token_budget_per_conversation or 0)
    usage_before = get_conversation_token_usage_today(str(conv.id))
    overhead = 4000 + int(config.max_tokens)
    if budget > 0 and usage_before + overhead > budget:
        if not _should_persist_ai_reply(inbound):
            return
        reply = Message.objects.create(
            conversation=conv,
            sender_type="ai_bot",
            content=_quota_exceeded_message(),
            message_type="text",
            status="pending" if conv.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"quota_blocked": True, "usage_before": usage_before, "budget": budget},
        )
        _enqueue_whatsapp_if_needed(conv, reply)
        return

    try:
        oa_messages = build_openai_messages(trigger_message=inbound, config=config)
        result = generate_chat_completion(messages=oa_messages, config=config)
    except Exception as exc:  # noqa: BLE001
        logger.exception("OpenAI reply failed: %s", exc)
        return

    if not result.text:
        return

    # If the LLM falls back to Calendly/external booking links, replace with real Google slots.
    if is_google_calendar_ready() and contains_external_booking_link(result.text):
        logger.info(
            "LLM proposed external booking link for conv %s; offering Google Calendar slots instead",
            conv.id,
        )
        calendar_reply = offer_availability_slots(inbound=inbound)
        if calendar_reply:
            if not _should_persist_ai_reply(inbound, exclude_reply_id=str(calendar_reply.id)):
                Message.objects.filter(pk=calendar_reply.pk).update(is_active=False, updated_at=timezone.now())
                latest = latest_contact_message(conv.id)
                if latest and str(latest.id) != str(inbound.id):
                    generate_ai_reply_for_message.delay(str(latest.id))
                return
            _enqueue_whatsapp_if_needed(conv, calendar_reply)
            return

    # Client may have sent another message while the LLM was running.
    if not _should_persist_ai_reply(inbound):
        latest = latest_contact_message(conv.id)
        if latest and str(latest.id) != str(inbound.id):
            generate_ai_reply_for_message.delay(str(latest.id))
        logger.info("Discarding AI completion for stale inbound %s", inbound.id)
        return

    if budget > 0 and not try_reserve_conversation_tokens(str(conv.id), result.total_tokens, budget):
        reply = Message.objects.create(
            conversation=conv,
            sender_type="ai_bot",
            content=_quota_exceeded_message(),
            message_type="text",
            status="pending" if conv.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={
                "quota_blocked_after_completion": True,
                "would_use_tokens": result.total_tokens,
                "budget": budget,
            },
        )
        _enqueue_whatsapp_if_needed(conv, reply)
        return

    moderation_meta: dict = {}
    if config.moderation_enabled:
        allowed, moderation_meta = moderate_openai_text(result.text)
        if not allowed:
            Conversation.objects.filter(pk=conv.pk).update(
                human_handoff_requested=True,
                human_handoff_at=timezone.now(),
            )
            reply = Message.objects.create(
                conversation=conv,
                sender_type="ai_bot",
                content=_moderation_blocked_message(),
                message_type="text",
                status="pending" if conv.channel == "whatsapp" else "sent",
                is_ai_generated=True,
                ai_context_used={
                    "moderation_blocked": True,
                    "moderation": moderation_meta,
                    "usage": _usage_dict(result),
                },
            )
            _enqueue_whatsapp_if_needed(conv, reply)
            logger.warning("AI reply blocked by moderation for conversation %s", conv.id)
            return

    if not _should_persist_ai_reply(inbound):
        latest = latest_contact_message(conv.id)
        if latest and str(latest.id) != str(inbound.id):
            generate_ai_reply_for_message.delay(str(latest.id))
        return

    audit = {
        "model": config.llm_model,
        "history_messages": config.max_history_messages,
        "usage": _usage_dict(result),
        "moderation": moderation_meta,
        "trigger_message_id": str(inbound.id),
    }
    reply = Message.objects.create(
        conversation=conv,
        sender_type="ai_bot",
        content=result.text,
        message_type="text",
        status="pending" if conv.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used=audit,
    )
    _enqueue_whatsapp_if_needed(conv, reply)


@shared_task(name="chat.tasks.fetch_whatsapp_media_for_message")
def fetch_whatsapp_media_for_message(message_id: str, media_id: str) -> None:
    """Download WhatsApp media from Graph API and attach to message."""
    try:
        msg = Message.objects.select_related("conversation__whatsapp_phone_number__account").get(pk=message_id)
    except Message.DoesNotExist:
        return
    phone_number = getattr(msg.conversation, "whatsapp_phone_number", None)
    try:
        data, mime = services.download_whatsapp_media_binary(media_id, phone_number=phone_number)
    except Exception as exc:  # noqa: BLE001
        logger.exception("WhatsApp media download failed: %s", exc)
        msg.metadata = {**msg.metadata, "media_download_error": str(exc)}
        msg.save(update_fields=["metadata", "updated_at"])
        return
    ext = ".bin"
    low = (mime or "").lower()
    if "pdf" in low:
        ext = ".pdf"
    elif "jpeg" in low or "jpg" in low:
        ext = ".jpg"
    elif "png" in low:
        ext = ".png"
    elif "ogg" in low or "audio" in low:
        ext = ".ogg"
    name = f"wa_{media_id}{ext}"
    MessageAttachment.objects.create(
        message=msg,
        file=ContentFile(data, name=name),
        file_name=name,
        file_type=mime or "application/octet-stream",
        file_size=len(data),
    )
    msg.metadata = {**msg.metadata, "media_downloaded": True, "whatsapp_media_id": media_id}
    msg.save(update_fields=["metadata", "updated_at"])


@shared_task(bind=True, name="chat.tasks.send_whatsapp_outbound")
def send_whatsapp_outbound(self, message_id: str) -> None:
    """Backward-compatible task name that delegates to whatsapp app task."""
    del self
    from apps.whatsapp.tasks import send_whatsapp_message

    send_whatsapp_message(str(message_id))

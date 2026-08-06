"""Guards to prevent duplicate AI replies on rapid inbound messages."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import redis
from django.conf import settings

if TYPE_CHECKING:
    from apps.chat.models import Message

logger = logging.getLogger(__name__)

AI_REPLY_DEBOUNCE_SECONDS = int(getattr(settings, "AI_REPLY_DEBOUNCE_SECONDS", 4) or 4)
AI_REPLY_LOCK_TTL_SECONDS = int(getattr(settings, "AI_REPLY_LOCK_TTL_SECONDS", 120) or 120)


def _redis() -> redis.Redis:
    url = getattr(settings, "REDIS_CACHE_URL", None) or settings.CELERY_BROKER_URL
    return redis.from_url(url, decode_responses=True)


def latest_contact_message(conversation_id) -> Message | None:
    from apps.chat.models import Message

    return (
        Message.objects.filter(
            conversation_id=conversation_id,
            sender_type="contact",
            is_active=True,
        )
        .order_by("-created_at", "-id")
        .first()
    )


def is_latest_contact_message(inbound: Message) -> bool:
    latest = latest_contact_message(inbound.conversation_id)
    return bool(latest and str(latest.id) == str(inbound.id))


def has_ai_reply_after(inbound: Message) -> bool:
    """True if an AI reply was already persisted after this inbound message."""
    from apps.chat.models import Message

    return Message.objects.filter(
        conversation_id=inbound.conversation_id,
        sender_type="ai_bot",
        is_ai_generated=True,
        is_active=True,
        created_at__gte=inbound.created_at,
    ).exists()


def acquire_conversation_ai_lock(conversation_id: str, *, owner: str) -> bool:
    """
    Acquire a short-lived per-conversation lock so only one AI generation runs.
    Returns True if this owner holds the lock.
    """
    key = f"ai:reply:lock:{conversation_id}"
    try:
        return bool(_redis().set(key, owner, nx=True, ex=AI_REPLY_LOCK_TTL_SECONDS))
    except Exception as exc:  # noqa: BLE001
        logger.warning("AI reply lock acquire failed: %s", exc)
        # Fail open: allow generation rather than dropping replies when Redis is down.
        return True


def release_conversation_ai_lock(conversation_id: str, *, owner: str) -> None:
    key = f"ai:reply:lock:{conversation_id}"
    try:
        r = _redis()
        current = r.get(key)
        if current == owner:
            r.delete(key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("AI reply lock release failed: %s", exc)

"""Per-conversation daily token budget (Redis)."""

from __future__ import annotations

import logging
from datetime import date, timedelta

import redis
from django.conf import settings

logger = logging.getLogger(__name__)


def _redis() -> redis.Redis:
    url = getattr(settings, "REDIS_CACHE_URL", None) or settings.CELERY_BROKER_URL
    return redis.from_url(url, decode_responses=True)


def _day_key(conversation_id: str, day: date | None = None) -> str:
    d = day or date.today()
    return f"ai:tokens:conv:{conversation_id}:{d.isoformat()}"


def get_conversation_token_usage_today(conversation_id: str) -> int:
    """Tokens already counted today (UTC) for this conversation."""
    try:
        raw = _redis().get(_day_key(conversation_id))
        return int(raw) if raw is not None else 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis token read failed: %s", exc)
        return 0


def try_reserve_conversation_tokens(conversation_id: str, tokens: int, budget: int) -> bool:
    """
    Atomically add token usage if still under daily budget.
    Returns False if reservation would exceed budget (no tokens added).
    budget <= 0 means unlimited (no Redis tracking).
    """
    if tokens <= 0:
        return True
    if budget <= 0:
        return True
    try:
        r = _redis()
        key = _day_key(conversation_id)
        new_total = r.incrby(key, tokens)
        r.expire(key, int(timedelta(days=2).total_seconds()))
        if new_total > budget:
            r.incrby(key, -tokens)
            return False
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis token reservation failed: %s", exc)
        return True

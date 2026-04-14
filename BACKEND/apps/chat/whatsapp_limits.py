"""Outbound WhatsApp rate limiting (Redis, per destination per minute)."""

from __future__ import annotations

import logging
import os
import time

import redis
from django.conf import settings

logger = logging.getLogger(__name__)


def _client() -> redis.Redis:
    url = getattr(settings, "REDIS_CACHE_URL", None) or settings.CELERY_BROKER_URL
    return redis.from_url(url, decode_responses=True)


def whatsapp_outbound_allowed(phone_digits: str) -> bool:
    """
    Reserve one send slot for this E.164 destination in the current minute bucket.
    Returns False if WHATSAPP_MAX_SENDS_PER_MINUTE would be exceeded.
    """
    try:
        max_per = int(os.getenv("WHATSAPP_MAX_SENDS_PER_MINUTE", "60"))
    except ValueError:
        max_per = 60
    if max_per <= 0:
        return True
    digits = "".join(c for c in phone_digits if c.isdigit())
    if not digits:
        return True
    try:
        r = _client()
        bucket = int(time.time() // 60)
        key = f"wa:out:{digits}:{bucket}"
        n = r.incr(key)
        if n == 1:
            r.expire(key, 120)
        if n > max_per:
            r.decr(key)
            return False
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("WhatsApp rate limit check failed (allowing send): %s", exc)
        return True

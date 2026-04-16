"""Runtime helpers for OpenAI settings resolved from DB with env fallback."""

from __future__ import annotations

import os

from apps.ai_config.models import AIRuntimeSettings


def get_or_create_runtime_settings() -> AIRuntimeSettings:
    """Return singleton runtime settings row."""

    obj, _ = AIRuntimeSettings.objects.get_or_create(singleton_key="default")
    return obj


def resolve_openai_api_key() -> str:
    """Resolve API key from DB first, then environment."""

    try:
        db_key = (get_or_create_runtime_settings().openai_api_key or "").strip()
    except Exception:  # noqa: BLE001
        db_key = ""
    if db_key:
        return db_key
    return os.getenv("OPENAI_API_KEY", "").strip()


def resolve_openai_embedding_model() -> str:
    """Resolve embedding model from DB first, then environment, then safe default."""

    try:
        db_model = (get_or_create_runtime_settings().openai_embedding_model or "").strip()
    except Exception:  # noqa: BLE001
        db_model = ""
    if db_model:
        return db_model
    return os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip() or "text-embedding-3-small"


def resolve_openai_moderation_disabled() -> bool:
    """Disable moderation if env says so or runtime setting enables it."""

    env_disabled = os.getenv("OPENAI_MODERATION_DISABLED", "").lower() in ("1", "true", "yes")
    if env_disabled:
        return True
    try:
        return bool(get_or_create_runtime_settings().openai_moderation_disabled)
    except Exception:  # noqa: BLE001
        return False

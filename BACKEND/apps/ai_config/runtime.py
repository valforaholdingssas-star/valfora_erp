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


def resolve_global_ai_mode_enabled() -> bool:
    """Resolve global AI mode switch from runtime settings."""

    try:
        return bool(get_or_create_runtime_settings().global_ai_mode_enabled)
    except Exception:  # noqa: BLE001
        return False


def resolve_unipile_api_base_url() -> str:
    try:
        db_value = (get_or_create_runtime_settings().unipile_api_base_url or "").strip()
    except Exception:  # noqa: BLE001
        db_value = ""
    if db_value:
        return db_value
    return os.getenv("UNIPILE_API_BASE_URL", "https://api1.unipile.com:13111/api/v1").strip()


def resolve_unipile_api_key() -> str:
    try:
        db_value = (get_or_create_runtime_settings().unipile_api_key or "").strip()
    except Exception:  # noqa: BLE001
        db_value = ""
    if db_value:
        return db_value
    return os.getenv("UNIPILE_API_KEY", "").strip()


def resolve_unipile_webhook_secret() -> str:
    try:
        db_value = (get_or_create_runtime_settings().unipile_webhook_secret or "").strip()
    except Exception:  # noqa: BLE001
        db_value = ""
    if db_value:
        return db_value
    return os.getenv("UNIPILE_WEBHOOK_SECRET", "").strip()


def resolve_unipile_link_callback_url() -> str:
    try:
        db_value = (get_or_create_runtime_settings().unipile_link_callback_url or "").strip()
    except Exception:  # noqa: BLE001
        db_value = ""
    if db_value:
        return db_value
    return os.getenv("UNIPILE_LINK_CALLBACK_URL", "").strip()


def resolve_linkedin_max_invitations_per_day() -> int:
    try:
        value = int(get_or_create_runtime_settings().linkedin_max_invitations_per_day)
        if value > 0:
            return value
    except Exception:  # noqa: BLE001
        pass
    return int(os.getenv("LINKEDIN_MAX_INVITATIONS_PER_DAY", "40"))


def resolve_linkedin_max_search_results_per_day() -> int:
    try:
        value = int(get_or_create_runtime_settings().linkedin_max_search_results_per_day)
        if value > 0:
            return value
    except Exception:  # noqa: BLE001
        pass
    return int(os.getenv("LINKEDIN_MAX_SEARCH_RESULTS_PER_DAY", "1000"))


def resolve_linkedin_max_messages_per_day() -> int:
    try:
        value = int(get_or_create_runtime_settings().linkedin_max_messages_per_day)
        if value > 0:
            return value
    except Exception:  # noqa: BLE001
        pass
    return int(os.getenv("LINKEDIN_MAX_MESSAGES_PER_DAY", "50"))

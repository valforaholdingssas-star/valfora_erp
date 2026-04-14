"""AI configuration app."""

from django.apps import AppConfig


class AiConfigConfig(AppConfig):
    """Django app config for AI settings and RAG helpers."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ai_config"
    verbose_name = "AI configuration"

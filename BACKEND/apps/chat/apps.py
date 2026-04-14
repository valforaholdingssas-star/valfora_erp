"""App configuration for chat."""

from django.apps import AppConfig


class ChatConfig(AppConfig):
    """Django app config for chat module."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.chat"
    verbose_name = "Chat"

    def ready(self) -> None:
        from apps.chat import signals  # noqa: F401

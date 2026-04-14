"""App config for notifications."""

from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """Notifications application."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    label = "notifications"
    verbose_name = "Notifications"

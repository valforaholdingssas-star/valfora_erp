"""Calendar app configuration."""

from django.apps import AppConfig


class CalendarAppConfig(AppConfig):
    """Configuration for calendar app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.calendar_app"

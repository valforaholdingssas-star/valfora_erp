"""App configuration for CRM."""

from django.apps import AppConfig


class CrmConfig(AppConfig):
    """Django app config for CRM module."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.crm"
    verbose_name = "CRM"

    def ready(self) -> None:
        """Import signal handlers."""
        from apps.crm import signals  # noqa: F401

"""Finance app config."""

from django.apps import AppConfig


class FinanceConfig(AppConfig):
    """Configuration for finance app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.finance"

    def ready(self):
        from apps.finance import signals  # noqa: F401

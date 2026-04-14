"""App configuration for WhatsApp integration."""

from django.apps import AppConfig


class WhatsAppConfig(AppConfig):
    """Django app config for WhatsApp integration."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.whatsapp"
    verbose_name = "WhatsApp"

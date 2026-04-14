"""Django admin for WhatsApp integration."""

from django.contrib import admin

from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber, WhatsAppTemplate


@admin.register(WhatsAppBusinessAccount)
class WhatsAppBusinessAccountAdmin(admin.ModelAdmin):
    list_display = ("name", "waba_id", "api_version", "is_active", "updated_at")
    search_fields = ("name", "waba_id")
    list_filter = ("is_active",)


@admin.register(WhatsAppPhoneNumber)
class WhatsAppPhoneNumberAdmin(admin.ModelAdmin):
    list_display = (
        "display_phone_number",
        "verified_name",
        "status",
        "default_assigned_user",
        "quality_rating",
        "messaging_limit",
        "is_default",
        "is_active",
    )
    search_fields = ("display_phone_number", "verified_name", "phone_number_id")
    list_filter = ("status", "quality_rating", "is_default", "is_active")


@admin.register(WhatsAppTemplate)
class WhatsAppTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "language", "category", "status", "account", "last_synced_at", "is_active")
    search_fields = ("name", "meta_template_id")
    list_filter = ("category", "status", "language", "is_active")

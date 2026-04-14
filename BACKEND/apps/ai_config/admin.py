"""Admin for AI configuration."""

from django.contrib import admin

from apps.ai_config.models import AIConfiguration


@admin.register(AIConfiguration)
class AIConfigurationAdmin(admin.ModelAdmin):
    """AI settings in Django admin."""

    list_display = (
        "name",
        "llm_model",
        "rag_enabled",
        "rag_top_k",
        "moderation_enabled",
        "daily_token_budget_per_conversation",
        "is_default",
        "is_active",
        "updated_at",
    )
    list_filter = ("is_default", "is_active", "llm_model", "moderation_enabled", "rag_enabled")
    search_fields = ("name",)

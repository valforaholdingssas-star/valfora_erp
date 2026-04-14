"""Serializers for AI configuration API."""

from rest_framework import serializers

from apps.ai_config.models import AIConfiguration


class AIConfigurationSerializer(serializers.ModelSerializer):
    """CRUD for AI settings (admin)."""

    class Meta:
        model = AIConfiguration
        fields = (
            "id",
            "name",
            "system_prompt",
            "temperature",
            "max_tokens",
            "llm_model",
            "is_default",
            "max_history_messages",
            "moderation_enabled",
            "daily_token_budget_per_conversation",
            "rag_enabled",
            "rag_top_k",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class AIConfigurationTestSerializer(serializers.Serializer):
    """Body for POST .../configurations/{id}/test/."""

    message = serializers.CharField(max_length=8000)

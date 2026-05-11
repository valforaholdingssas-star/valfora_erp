"""Serializers for AI configuration API."""

from rest_framework import serializers

from apps.ai_config.models import AIConfiguration, AIRuntimeSettings


class AIConfigurationSerializer(serializers.ModelSerializer):
    """CRUD for AI settings (admin)."""

    class Meta:
        model = AIConfiguration
        fields = (
            "id",
            "name",
            "system_prompt",
            "objective",
            "role",
            "tone",
            "style",
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


class AIRuntimeSettingsSerializer(serializers.ModelSerializer):
    """Read/update OpenAI runtime credentials without exposing raw secret."""

    openai_api_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    clear_openai_api_key = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    has_openai_api_key = serializers.SerializerMethodField(read_only=True)
    openai_api_key_masked = serializers.SerializerMethodField(read_only=True)
    google_service_account_json = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    clear_google_service_account_json = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    has_google_service_account_json = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AIRuntimeSettings
        fields = (
            "id",
            "has_openai_api_key",
            "openai_api_key_masked",
            "openai_api_key",
            "clear_openai_api_key",
            "openai_embedding_model",
            "openai_moderation_disabled",
            "global_ai_mode_enabled",
            "google_calendar_enabled",
            "google_calendar_id",
            "google_calendar_timezone",
            "google_slot_minutes",
            "google_booking_window_days",
            "has_google_service_account_json",
            "google_service_account_json",
            "clear_google_service_account_json",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "has_openai_api_key",
            "openai_api_key_masked",
            "has_google_service_account_json",
            "updated_at",
        )

    def get_has_openai_api_key(self, obj: AIRuntimeSettings) -> bool:
        return bool((obj.openai_api_key or "").strip())

    def get_openai_api_key_masked(self, obj: AIRuntimeSettings) -> str:
        value = (obj.openai_api_key or "").strip()
        if not value:
            return ""
        tail = value[-4:] if len(value) >= 4 else value
        return f"••••••••••••{tail}"

    def get_has_google_service_account_json(self, obj: AIRuntimeSettings) -> bool:
        return bool((obj.google_service_account_json or "").strip())

    def update(self, instance: AIRuntimeSettings, validated_data):
        maybe_key = validated_data.pop("openai_api_key", None)
        clear = bool(validated_data.pop("clear_openai_api_key", False))
        maybe_gc_sa = validated_data.pop("google_service_account_json", None)
        clear_gc_sa = bool(validated_data.pop("clear_google_service_account_json", False))
        if clear:
            instance.openai_api_key = ""
        elif maybe_key is not None:
            maybe_key = maybe_key.strip()
            if maybe_key:
                instance.openai_api_key = maybe_key
        if clear_gc_sa:
            instance.google_service_account_json = ""
        elif maybe_gc_sa is not None:
            text = maybe_gc_sa.strip()
            if text:
                instance.google_service_account_json = text
        return super().update(instance, validated_data)

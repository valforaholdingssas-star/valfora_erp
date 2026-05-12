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
    unipile_api_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    clear_unipile_api_key = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    has_unipile_api_key = serializers.SerializerMethodField(read_only=True)
    unipile_api_key_masked = serializers.SerializerMethodField(read_only=True)
    unipile_webhook_secret = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    clear_unipile_webhook_secret = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    has_unipile_webhook_secret = serializers.SerializerMethodField(read_only=True)
    unipile_webhook_secret_masked = serializers.SerializerMethodField(read_only=True)

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
            "unipile_api_base_url",
            "unipile_link_callback_url",
            "linkedin_max_invitations_per_day",
            "linkedin_max_search_results_per_day",
            "linkedin_max_messages_per_day",
            "has_unipile_api_key",
            "unipile_api_key_masked",
            "unipile_api_key",
            "clear_unipile_api_key",
            "has_unipile_webhook_secret",
            "unipile_webhook_secret_masked",
            "unipile_webhook_secret",
            "clear_unipile_webhook_secret",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "has_openai_api_key",
            "openai_api_key_masked",
            "has_google_service_account_json",
            "has_unipile_api_key",
            "unipile_api_key_masked",
            "has_unipile_webhook_secret",
            "unipile_webhook_secret_masked",
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

    def get_has_unipile_api_key(self, obj: AIRuntimeSettings) -> bool:
        return bool((obj.unipile_api_key or "").strip())

    def get_unipile_api_key_masked(self, obj: AIRuntimeSettings) -> str:
        value = (obj.unipile_api_key or "").strip()
        if not value:
            return ""
        tail = value[-4:] if len(value) >= 4 else value
        return f"••••••••••••{tail}"

    def get_has_unipile_webhook_secret(self, obj: AIRuntimeSettings) -> bool:
        return bool((obj.unipile_webhook_secret or "").strip())

    def get_unipile_webhook_secret_masked(self, obj: AIRuntimeSettings) -> str:
        value = (obj.unipile_webhook_secret or "").strip()
        if not value:
            return ""
        tail = value[-4:] if len(value) >= 4 else value
        return f"••••••••••••{tail}"

    def update(self, instance: AIRuntimeSettings, validated_data):
        maybe_key = validated_data.pop("openai_api_key", None)
        clear = bool(validated_data.pop("clear_openai_api_key", False))
        maybe_gc_sa = validated_data.pop("google_service_account_json", None)
        clear_gc_sa = bool(validated_data.pop("clear_google_service_account_json", False))
        maybe_unipile_key = validated_data.pop("unipile_api_key", None)
        clear_unipile_key = bool(validated_data.pop("clear_unipile_api_key", False))
        maybe_unipile_secret = validated_data.pop("unipile_webhook_secret", None)
        clear_unipile_secret = bool(validated_data.pop("clear_unipile_webhook_secret", False))
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
        if clear_unipile_key:
            instance.unipile_api_key = ""
        elif maybe_unipile_key is not None:
            text = maybe_unipile_key.strip()
            if text:
                instance.unipile_api_key = text
        if clear_unipile_secret:
            instance.unipile_webhook_secret = ""
        elif maybe_unipile_secret is not None:
            text = maybe_unipile_secret.strip()
            if text:
                instance.unipile_webhook_secret = text
        return super().update(instance, validated_data)

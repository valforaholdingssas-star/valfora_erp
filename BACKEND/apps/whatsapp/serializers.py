"""Serializers for WhatsApp API endpoints."""

from rest_framework import serializers

from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber, WhatsAppTemplate


class WhatsAppBusinessAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppBusinessAccount
        fields = (
            "id",
            "name",
            "waba_id",
            "access_token",
            "api_version",
            "webhook_verify_token",
            "webhook_secret",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {
            "access_token": {"write_only": True},
            "webhook_secret": {"write_only": True},
        }


class WhatsAppPhoneNumberSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = WhatsAppPhoneNumber
        fields = (
            "id",
            "account",
            "account_name",
            "phone_number_id",
            "display_phone_number",
            "verified_name",
            "quality_rating",
            "messaging_limit",
            "status",
            "is_default",
            "default_assigned_user",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class WhatsAppTemplateSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = WhatsAppTemplate
        fields = (
            "id",
            "account",
            "account_name",
            "meta_template_id",
            "name",
            "category",
            "language",
            "status",
            "rejection_reason",
            "header_type",
            "header_content",
            "body_text",
            "footer_text",
            "buttons",
            "example_values",
            "last_synced_at",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "meta_template_id", "last_synced_at", "created_at", "updated_at")


class TemplateSendSerializer(serializers.Serializer):
    template_id = serializers.UUIDField()
    variables = serializers.ListField(child=serializers.CharField(), required=False, default=list)

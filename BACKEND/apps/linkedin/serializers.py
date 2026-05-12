"""Serializers for LinkedIn module."""

from rest_framework import serializers

from apps.linkedin.constants import FUNNEL_STAGES
from apps.linkedin.models import (
    InvitationTemplate,
    LinkedInAccount,
    LinkedInProspect,
    MessageTemplate,
    ProspectStageLog,
    SavedSearch,
)


class LinkedInAccountSerializer(serializers.ModelSerializer):
    """Serializer for LinkedIn account."""

    class Meta:
        model = LinkedInAccount
        fields = "__all__"
        read_only_fields = ("user", "connected_at", "last_sync_at", "created_at", "updated_at")


class SavedSearchSerializer(serializers.ModelSerializer):
    """Serializer for saved searches."""

    class Meta:
        model = SavedSearch
        fields = "__all__"
        read_only_fields = ("account", "last_executed_at", "total_results_found", "created_at", "updated_at")


class ProspectStageLogSerializer(serializers.ModelSerializer):
    """Serializer for stage logs."""

    changed_by_email = serializers.EmailField(source="changed_by.email", read_only=True)

    class Meta:
        model = ProspectStageLog
        fields = (
            "id",
            "prospect",
            "from_stage",
            "to_stage",
            "changed_by",
            "changed_by_email",
            "reason",
            "created_at",
        )
        read_only_fields = ("created_at",)


class LinkedInProspectSerializer(serializers.ModelSerializer):
    """Serializer for LinkedIn prospects."""

    stage_logs = ProspectStageLogSerializer(many=True, read_only=True)
    account_name = serializers.CharField(source="account.linkedin_name", read_only=True)

    class Meta:
        model = LinkedInProspect
        fields = "__all__"
        read_only_fields = (
            "account",
            "invitation_sent_at",
            "invitation_accepted_at",
            "last_message_at",
            "last_message_direction",
            "created_at",
            "updated_at",
        )


class ProspectMoveStageSerializer(serializers.Serializer):
    """Input serializer for moving funnel stage."""

    to_stage = serializers.ChoiceField(choices=[value for value, _ in FUNNEL_STAGES])
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class BulkIdsSerializer(serializers.Serializer):
    """Simple serializer for bulk operations."""

    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)


class LinkCrmSerializer(serializers.Serializer):
    """Input serializer for linking a prospect to CRM contact."""

    contact_id = serializers.UUIDField(required=False)
    create_contact = serializers.BooleanField(required=False, default=False)


class InvitationTemplateSerializer(serializers.ModelSerializer):
    """Serializer for invitation templates."""

    class Meta:
        model = InvitationTemplate
        fields = "__all__"
        read_only_fields = ("account", "times_used", "created_at", "updated_at")


class MessageTemplateSerializer(serializers.ModelSerializer):
    """Serializer for message templates."""

    class Meta:
        model = MessageTemplate
        fields = "__all__"
        read_only_fields = ("account", "times_used", "created_at", "updated_at")


class SendInvitationSerializer(serializers.Serializer):
    """Input serializer for sending invitation."""

    message = serializers.CharField(required=False, allow_blank=True, max_length=300)


class SendMessageSerializer(serializers.Serializer):
    """Input serializer for sending LinkedIn message."""

    text = serializers.CharField(max_length=2000)


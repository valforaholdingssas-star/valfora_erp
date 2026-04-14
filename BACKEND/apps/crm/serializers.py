"""Serializers for CRM models."""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.crm.models import (
    Activity,
    Company,
    Contact,
    Deal,
    DealStageHistory,
    Document,
    LeadEngineConfig,
    PipelineAutomationConfig,
)

User = get_user_model()


class CompanySerializer(serializers.ModelSerializer):
    """Serializer for Company."""

    contacts_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Company
        fields = (
            "id",
            "name",
            "industry",
            "website",
            "address",
            "city",
            "country",
            "employee_count",
            "annual_revenue",
            "notes",
            "contacts_count",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class ContactSerializer(serializers.ModelSerializer):
    """Serializer for Contact with computed day counters."""

    days_since_last_contact = serializers.SerializerMethodField()
    days_since_creation = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True, default="")

    class Meta:
        model = Contact
        fields = (
            "id",
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "whatsapp_number",
            "company",
            "company_name",
            "position",
            "source",
            "intent_level",
            "lifecycle_stage",
            "assigned_to",
            "last_contact_date",
            "days_since_last_contact",
            "days_since_creation",
            "notes",
            "tags",
            "custom_fields",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        )
        read_only_fields = (
            "id",
            "last_contact_date",
            "days_since_last_contact",
            "days_since_creation",
            "created_at",
            "updated_at",
        )

    def get_days_since_last_contact(self, obj: Contact) -> int | None:
        return obj.days_since_last_contact

    def get_days_since_creation(self, obj: Contact) -> int:
        return obj.days_since_creation


class DealSerializer(serializers.ModelSerializer):
    """Serializer for Deal."""

    contact_name = serializers.SerializerMethodField()

    class Meta:
        model = Deal
        fields = (
            "id",
            "title",
            "contact",
            "contact_name",
            "company",
            "value",
            "currency",
            "stage",
            "source",
            "probability",
            "expected_close_date",
            "assigned_to",
            "description",
            "lost_reason",
            "is_stale",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "contact_name", "created_at", "updated_at")

    def get_contact_name(self, obj: Deal) -> str:
        return str(obj.contact)

    def validate_probability(self, value: int) -> int:
        if value < 0 or value > 100:
            raise serializers.ValidationError("Probability must be between 0 and 100.")
        return value


class ActivitySerializer(serializers.ModelSerializer):
    """Serializer for Activity."""

    class Meta:
        model = Activity
        fields = (
            "id",
            "contact",
            "deal",
            "activity_type",
            "subject",
            "description",
            "due_date",
            "completed_at",
            "is_completed",
            "assigned_to",
            "created_by",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "completed_at", "created_by", "created_at", "updated_at")


class DocumentSerializer(serializers.ModelSerializer):
    """Serializer for Document uploads."""

    def validate(self, attrs: dict) -> dict:
        contact = attrs.get("contact")
        deal = attrs.get("deal")
        if self.instance:
            contact = contact if "contact" in attrs else self.instance.contact
            deal = deal if "deal" in attrs else self.instance.deal
        if not contact and not deal:
            raise serializers.ValidationError("Debe asociar el documento a un contacto o a un deal.")
        return attrs

    class Meta:
        model = Document
        fields = (
            "id",
            "contact",
            "deal",
            "name",
            "file",
            "file_type",
            "file_size",
            "description",
            "uploaded_by",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "file_type", "file_size", "uploaded_by", "created_at", "updated_at")


class BulkContactAssignSerializer(serializers.Serializer):
    """Bulk assign CRM contacts to a user."""

    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=500)
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )


class BulkContactStageSerializer(serializers.Serializer):
    """Bulk update lifecycle stage."""

    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=500)
    lifecycle_stage = serializers.ChoiceField(choices=[c[0] for c in Contact.LIFECYCLE_CHOICES])


class DealStageHistorySerializer(serializers.ModelSerializer):
    """Serializer for deal stage movement timeline."""

    class Meta:
        model = DealStageHistory
        fields = (
            "id",
            "deal",
            "from_stage",
            "to_stage",
            "moved_by",
            "trigger",
            "notes",
            "created_at",
        )
        read_only_fields = fields


class LeadEngineConfigSerializer(serializers.ModelSerializer):
    """Serializer for lead automation settings."""

    class Meta:
        model = LeadEngineConfig
        fields = (
            "id",
            "auto_create_contact",
            "auto_create_deal",
            "default_deal_pipeline_stage",
            "default_deal_title_template",
            "auto_create_follow_up",
            "max_response_time_minutes",
            "auto_complete_activities_on_reply",
            "default_intent_level",
            "default_lifecycle_stage",
            "assignment_strategy",
            "assignment_users",
            "assignment_specific_user",
            "notify_on_new_lead",
            "notify_on_returning_contact",
            "auto_response_template",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class PipelineAutomationConfigSerializer(serializers.ModelSerializer):
    """Serializer for pipeline automation flags."""

    class Meta:
        model = PipelineAutomationConfig
        fields = (
            "id",
            "auto_move_on_first_response",
            "auto_move_on_meeting",
            "auto_move_on_proposal",
            "auto_move_on_contract",
            "auto_move_on_contract_signed",
            "stale_deal_days",
            "auto_close_lost_days",
            "notify_on_stage_change",
            "log_auto_movements",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

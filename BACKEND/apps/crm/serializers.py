"""Serializers for CRM models."""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.crm.models import (
    Activity,
    Company,
    Contact,
    Deal,
    DealCall,
    DealStageHistory,
    Document,
    LeadEngineConfig,
    PipelineStage,
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
    contact_email = serializers.EmailField(source="contact.email", read_only=True)
    company_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    calls_count = serializers.SerializerMethodField()

    class Meta:
        model = Deal
        fields = (
            "id",
            "title",
            "contact",
            "contact_name",
            "contact_email",
            "company",
            "company_name",
            "value",
            "currency",
            "stage",
            "source",
            "probability",
            "expected_close_date",
            "assigned_to",
            "assigned_to_name",
            "description",
            "business_notes",
            "lost_reason",
            "is_stale",
            "calls_count",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "contact_name",
            "contact_email",
            "company_name",
            "assigned_to_name",
            "calls_count",
            "created_at",
            "updated_at",
        )

    def get_contact_name(self, obj: Deal) -> str:
        return str(obj.contact)

    def get_company_name(self, obj: Deal) -> str:
        if obj.company_id and obj.company:
            return obj.company.name
        if obj.contact_id and obj.contact and obj.contact.company_id and obj.contact.company:
            return obj.contact.company.name
        return ""

    def get_assigned_to_name(self, obj: Deal) -> str:
        if not obj.assigned_to:
            return ""
        full_name = getattr(obj.assigned_to, "get_full_name", lambda: "")()
        return full_name.strip() or getattr(obj.assigned_to, "email", "") or getattr(obj.assigned_to, "username", "")

    def get_calls_count(self, obj: Deal) -> int:
        annotated = getattr(obj, "calls_count", None)
        if annotated is not None:
            return int(annotated)
        return obj.calls.filter(is_active=True).count()

    def validate_probability(self, value: int) -> int:
        if value < 0 or value > 100:
            raise serializers.ValidationError("Probability must be between 0 and 100.")
        return value

    def validate_stage(self, value: str) -> str:
        from apps.crm.pipeline_automation import PipelineAutomationService as PAS

        stage = PAS.normalize_stage((value or "").strip())
        if not stage:
            raise serializers.ValidationError("La etapa es requerida.")
        if stage not in PAS.get_stage_map():
            raise serializers.ValidationError("Etapa desconocida.")
        return stage

    def validate(self, attrs):
        contact = attrs.get("contact", getattr(self.instance, "contact", None))
        company = attrs.get("company", getattr(self.instance, "company", None))
        if not company and contact and getattr(contact, "company_id", None):
            attrs["company"] = contact.company
        return attrs


class PipelineStageSerializer(serializers.ModelSerializer):
    """Serializer for configurable deal pipeline stages."""

    class Meta:
        model = PipelineStage
        fields = (
            "id",
            "key",
            "name",
            "position",
            "accent_color",
            "tint_color",
            "is_closed_stage",
            "is_won_stage",
            "is_lost_stage",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


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

    @staticmethod
    def _coerce_bool(value) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, (int, float)):
            return bool(value)
        text = str(value).strip().lower()
        return text in {"1", "true", "t", "yes", "y", "on"}

    def validate(self, attrs: dict) -> dict:
        contact = attrs.get("contact")
        deal = attrs.get("deal")
        is_global_knowledge = attrs.get("is_global_knowledge")
        if "is_global_knowledge" in attrs:
            is_global_knowledge = self._coerce_bool(is_global_knowledge)
        if self.instance:
            contact = contact if "contact" in attrs else self.instance.contact
            deal = deal if "deal" in attrs else self.instance.deal
            ai_configuration = (
                attrs.get("ai_configuration")
                if "ai_configuration" in attrs
                else self.instance.ai_configuration
            )
            is_global_knowledge = (
                is_global_knowledge
                if "is_global_knowledge" in attrs
                else self.instance.is_global_knowledge
            )
        else:
            ai_configuration = attrs.get("ai_configuration")
            # Multipart/form-data can provide booleans as strings.
            if "is_global_knowledge" not in attrs:
                raw = None
                if hasattr(self, "initial_data"):
                    raw = self.initial_data.get("is_global_knowledge")
                if raw is not None:
                    is_global_knowledge = self._coerce_bool(raw)
                    attrs["is_global_knowledge"] = is_global_knowledge
        if not contact and not deal and not is_global_knowledge and not ai_configuration:
            raise serializers.ValidationError(
                "Debe asociar el documento a un contacto/deal/agente o marcarlo como conocimiento global."
            )
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
            "is_global_knowledge",
            "ai_configuration",
            "uploaded_by",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "file_type",
            "file_size",
            "uploaded_by",
            "is_active",
            "created_at",
            "updated_at",
        )


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

    public_ingest_api_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    clear_public_ingest_api_key = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    has_public_ingest_api_key = serializers.SerializerMethodField(read_only=True)
    public_ingest_api_key_masked = serializers.SerializerMethodField(read_only=True)

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
            "public_ingest_enabled",
            "public_ingest_allowed_origins",
            "has_public_ingest_api_key",
            "public_ingest_api_key_masked",
            "public_ingest_api_key",
            "clear_public_ingest_api_key",
            "auto_response_template",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "has_public_ingest_api_key",
            "public_ingest_api_key_masked",
            "created_at",
            "updated_at",
        )

    def get_has_public_ingest_api_key(self, obj: LeadEngineConfig) -> bool:
        from apps.crm.lead_ingest_auth import resolve_lead_ingest_api_key

        return bool(resolve_lead_ingest_api_key(obj))

    def get_public_ingest_api_key_masked(self, obj: LeadEngineConfig) -> str:
        from apps.crm.lead_ingest_auth import resolve_lead_ingest_api_key

        value = resolve_lead_ingest_api_key(obj)
        if not value:
            return ""
        if len(value) <= 8:
            return "****"
        return f"{value[:4]}...{value[-4:]}"

    def update(self, instance, validated_data):
        maybe_key = validated_data.pop("public_ingest_api_key", None)
        clear_key = bool(validated_data.pop("clear_public_ingest_api_key", False))
        instance = super().update(instance, validated_data)
        if clear_key:
            instance.public_ingest_api_key = ""
            instance.save(update_fields=["public_ingest_api_key", "updated_at"])
        elif maybe_key is not None and maybe_key != "":
            instance.public_ingest_api_key = maybe_key
            instance.save(update_fields=["public_ingest_api_key", "updated_at"])
        return instance


class PublicLeadIngestSerializer(serializers.Serializer):
    """Payload for external web forms creating CRM leads."""

    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    phone_number = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    message = serializers.CharField(required=False, allow_blank=True, default="")
    company_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    deal_title = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    source = serializers.ChoiceField(choices=Contact.SOURCE_CHOICES, default="website")
    intent_level = serializers.ChoiceField(
        choices=Contact.INTENT_CHOICES,
        required=False,
        allow_blank=True,
        default="",
    )
    create_deal = serializers.BooleanField(required=False, allow_null=True, default=None)
    external_id = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    custom_fields = serializers.DictField(required=False, default=dict)

    def validate(self, attrs):
        first_name = (attrs.get("first_name") or "").strip()
        last_name = (attrs.get("last_name") or "").strip()
        full_name = (attrs.get("full_name") or "").strip()
        if not first_name and not last_name and full_name:
            pieces = full_name.split(" ", 1)
            first_name = pieces[0]
            last_name = pieces[1] if len(pieces) > 1 else "Lead"
        if not first_name:
            first_name = "Nuevo"
        if not last_name:
            last_name = "Lead"
        attrs["first_name"] = first_name
        attrs["last_name"] = last_name
        attrs.pop("full_name", None)
        return attrs


class PublicLeadIngestResponseSerializer(serializers.Serializer):
    """Response payload for public lead ingest."""

    contact_id = serializers.UUIDField()
    deal_id = serializers.UUIDField(allow_null=True)
    contact_email = serializers.EmailField()
    is_new_contact = serializers.BooleanField()
    is_new_deal = serializers.BooleanField()
    contact_name = serializers.CharField()
    deal_title = serializers.CharField(allow_blank=True)


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
            "closed_chat_stage_key",
            "notify_on_stage_change",
            "log_auto_movements",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class DealCallSerializer(serializers.ModelSerializer):
    """Serializer for deal call logs."""

    deal_title = serializers.CharField(source="deal.title", read_only=True)
    contact_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DealCall
        fields = (
            "id",
            "deal",
            "deal_title",
            "contact_name",
            "notes",
            "called_at",
            "created_by",
            "created_by_name",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "deal_title",
            "contact_name",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )

    def get_contact_name(self, obj: DealCall) -> str:
        if obj.deal_id and obj.deal and obj.deal.contact_id:
            return str(obj.deal.contact)
        return ""

    def get_created_by_name(self, obj: DealCall) -> str:
        if not obj.created_by:
            return ""
        full_name = getattr(obj.created_by, "get_full_name", lambda: "")()
        return full_name.strip() or getattr(obj.created_by, "email", "") or ""

    def validate_notes(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("La nota de la llamada es obligatoria.")
        return cleaned


class DealBulkUpdateSerializer(serializers.Serializer):
    """Payload for mass-updating selected deals."""

    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )
    stage = serializers.CharField(required=False, allow_blank=False)
    company = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )
    source = serializers.ChoiceField(choices=Deal.SOURCE_CHOICES, required=False)
    probability = serializers.IntegerField(required=False, min_value=0, max_value=100)

    def validate(self, attrs):
        mutable_keys = {"assigned_to", "stage", "company", "source", "probability"}
        if not any(key in attrs for key in mutable_keys):
            raise serializers.ValidationError({"detail": "Debes enviar al menos un campo a actualizar."})
        stage = attrs.get("stage")
        if stage:
            from apps.crm.pipeline_automation import PipelineAutomationService as PAS

            attrs["stage"] = PAS.normalize_stage(stage)
            if attrs["stage"] not in PAS.get_stage_map():
                raise serializers.ValidationError({"stage": "Etapa desconocida."})
        return attrs

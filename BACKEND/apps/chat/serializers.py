"""Serializers for chat API."""

from rest_framework import serializers

from apps.ai_config.models import AIConfiguration
from apps.chat.models import Conversation, Message, MessageAttachment
from apps.crm.models import Contact, Deal


class MessageSerializer(serializers.ModelSerializer):
    """Message read/write."""

    attachments = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Message
        fields = (
            "id",
            "conversation",
            "sender_type",
            "sender_user",
            "content",
            "message_type",
            "whatsapp_message_id",
            "status",
            "metadata",
            "is_ai_generated",
            "ai_context_used",
            "attachments",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "conversation",
            "sender_user",
            "whatsapp_message_id",
            "status",
            "metadata",
            "is_ai_generated",
            "ai_context_used",
            "created_at",
            "updated_at",
        )

    def get_attachments(self, obj: Message) -> list[dict]:
        request = self.context.get("request")
        return [
            {
                "id": str(a.id),
                "file_name": a.file_name,
                "file_type": a.file_type,
                "file_size": a.file_size,
                "url": request.build_absolute_uri(a.file.url) if request else a.file.url,
            }
            for a in obj.attachments.filter(is_active=True)
        ]


class ConversationSerializer(serializers.ModelSerializer):
    """Conversation with nested contact summary."""

    contact_name = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    last_message_preview = serializers.SerializerMethodField()
    ai_configuration_name = serializers.SerializerMethodField()
    deal_title = serializers.SerializerMethodField()
    deal_stage = serializers.SerializerMethodField()
    latest_deal_id = serializers.SerializerMethodField()
    latest_deal_stage = serializers.SerializerMethodField()
    latest_deal_created_at = serializers.SerializerMethodField()
    latest_deal_assigned_to = serializers.SerializerMethodField()
    ai_configuration = serializers.PrimaryKeyRelatedField(
        queryset=AIConfiguration.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Conversation
        fields = (
            "id",
            "contact",
            "contact_name",
            "contact_email",
            "channel",
            "status",
            "ai_mode_enabled",
            "ai_configuration",
            "ai_configuration_name",
            "deal",
            "deal_title",
            "deal_stage",
            "human_handoff_requested",
            "human_handoff_at",
            "assigned_to",
            "whatsapp_phone_number",
            "customer_service_window_expires",
            "last_inbound_message_at",
            "last_message_at",
            "unread_count",
            "last_message_preview",
            "latest_deal_id",
            "latest_deal_stage",
            "latest_deal_created_at",
            "latest_deal_assigned_to",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "last_message_at",
            "unread_count",
            "human_handoff_requested",
            "human_handoff_at",
            "last_inbound_message_at",
            "created_at",
            "updated_at",
        )

    def get_contact_name(self, obj: Conversation) -> str:
        return f"{obj.contact.first_name} {obj.contact.last_name}".strip()

    def get_contact_email(self, obj: Conversation) -> str:
        return obj.contact.email

    def get_last_message_preview(self, obj: Conversation) -> str:
        last = obj.messages.filter(is_active=True).order_by("-created_at").first()
        return (last.content[:120] + "…") if last and len(last.content) > 120 else (last.content if last else "")

    def get_ai_configuration_name(self, obj: Conversation) -> str | None:
        if obj.ai_configuration_id and getattr(obj, "ai_configuration", None):
            return obj.ai_configuration.name
        return None

    def _latest_deal(self, obj: Conversation):
        if obj.deal_id:
            return obj.deal
        return obj.contact.deals.filter(is_active=True).order_by("-created_at").first()

    def get_deal_title(self, obj: Conversation):
        deal = self._latest_deal(obj)
        return deal.title if deal else None

    def get_deal_stage(self, obj: Conversation):
        deal = self._latest_deal(obj)
        return deal.stage if deal else None

    def get_latest_deal_id(self, obj: Conversation):
        deal = self._latest_deal(obj)
        return str(deal.id) if deal else None

    def get_latest_deal_stage(self, obj: Conversation):
        deal = self._latest_deal(obj)
        return deal.stage if deal else None

    def get_latest_deal_created_at(self, obj: Conversation):
        deal = self._latest_deal(obj)
        return deal.created_at if deal else None

    def get_latest_deal_assigned_to(self, obj: Conversation):
        deal = self._latest_deal(obj)
        return str(deal.assigned_to_id) if deal and deal.assigned_to_id else None


class MessageCreateSerializer(serializers.Serializer):
    """Payload for agent sending a message."""

    content = serializers.CharField(required=False, allow_blank=True, default="")
    message_type = serializers.ChoiceField(choices=Message.TYPE_CHOICES, default="text")


class TemplateMessageSerializer(serializers.Serializer):
    """Payload for sending an approved template on a conversation."""

    template_id = serializers.UUIDField()
    variables = serializers.ListField(child=serializers.CharField(), required=False, default=list)


class ConversationCreateSerializer(serializers.ModelSerializer):
    """Create conversation (contact + channel)."""

    contact = serializers.PrimaryKeyRelatedField(
        queryset=Contact.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )
    ai_configuration = serializers.PrimaryKeyRelatedField(
        queryset=AIConfiguration.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )
    deal = serializers.PrimaryKeyRelatedField(
        queryset=Deal.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Conversation
        fields = ("contact", "deal", "channel", "assigned_to", "status", "ai_configuration")
        validators = []

    def validate_contact(self, value: Contact) -> Contact:
        return value

    def validate(self, attrs):
        contact = attrs.get("contact")
        deal = attrs.get("deal")
        if deal and contact and deal.contact_id != contact.id:
            raise serializers.ValidationError({"deal": "El deal no pertenece al contacto seleccionado."})
        if not deal and not contact:
            raise serializers.ValidationError({"detail": "Debes enviar deal o contact."})
        if deal and not contact:
            attrs["contact"] = deal.contact
        return attrs

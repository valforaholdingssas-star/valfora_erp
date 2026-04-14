"""Chat models: conversations and messages."""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common.models import BaseModel
from apps.crm.models import Contact, Deal


class Conversation(BaseModel):
    """Chat thread tied to a CRM contact."""

    CHANNEL_CHOICES = (
        ("whatsapp", "WhatsApp"),
        ("internal", "Internal"),
    )
    STATUS_CHOICES = (
        ("active", "Active"),
        ("archived", "Archived"),
        ("blocked", "Blocked"),
    )

    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="conversations")
    deal = models.ForeignKey(
        Deal,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="conversations",
    )
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active", db_index=True)
    ai_mode_enabled = models.BooleanField(default=False)
    ai_configuration = models.ForeignKey(
        "ai_config.AIConfiguration",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversations",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_conversations_assigned",
    )
    whatsapp_phone_number = models.ForeignKey(
        "whatsapp.WhatsAppPhoneNumber",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversations",
    )
    last_message_at = models.DateTimeField(null=True, blank=True)
    unread_count = models.PositiveIntegerField(default=0)
    customer_service_window_expires = models.DateTimeField(null=True, blank=True)
    last_inbound_message_at = models.DateTimeField(null=True, blank=True)
    human_handoff_requested = models.BooleanField(default=False, db_index=True)
    human_handoff_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Conversation"
        verbose_name_plural = "Conversations"
        ordering = ["-last_message_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["deal", "channel"],
                condition=Q(deal__isnull=False),
                name="chat_unique_deal_channel",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.channel} · {self.contact}"


class Message(BaseModel):
    """Single chat message."""

    SENDER_CHOICES = (
        ("user", "User"),
        ("contact", "Contact"),
        ("ai_bot", "AI bot"),
    )
    TYPE_CHOICES = (
        ("text", "Text"),
        ("image", "Image"),
        ("document", "Document"),
        ("audio", "Audio"),
        ("video", "Video"),
        ("location", "Location"),
    )
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("sent", "Sent"),
        ("delivered", "Delivered"),
        ("read", "Read"),
        ("failed", "Failed"),
        ("dead_letter", "Dead letter"),
    )

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender_type = models.CharField(max_length=20, choices=SENDER_CHOICES, db_index=True)
    sender_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_messages_sent",
    )
    content = models.TextField(blank=True)
    message_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="text")
    whatsapp_message_id = models.CharField(max_length=128, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_ai_generated = models.BooleanField(default=False)
    ai_context_used = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Message"
        verbose_name_plural = "Messages"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["whatsapp_message_id"],
                condition=~Q(whatsapp_message_id=""),
                name="chat_unique_non_empty_whatsapp_message_id",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.sender_type}: {self.content[:40]}"


class MessageAttachment(BaseModel):
    """Binary attachment for a message."""

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="chat/attachments/%Y/%m/")
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Message attachment"
        verbose_name_plural = "Message attachments"

    def __str__(self) -> str:
        return self.file_name

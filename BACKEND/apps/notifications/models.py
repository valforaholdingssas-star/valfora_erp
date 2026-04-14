"""Notification model (persistent + WebSocket push)."""

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class Notification(BaseModel):
    """User notification (CRM, chat, sistema)."""

    TYPE_CHOICES = (
        ("chat_message", "Chat message"),
        ("crm_stale_contact", "CRM stale contact"),
        ("deal_due", "Deal due"),
        ("activity_due", "Activity due"),
        ("contact_assigned", "Contact assigned"),
        ("ai_handoff", "AI handoff"),
        ("system", "System"),
    )

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(max_length=40, choices=TYPE_CHOICES, db_index=True)
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    action_url = models.CharField(max_length=512, blank=True)
    related_object_type = models.CharField(max_length=80, blank=True)
    related_object_id = models.UUIDField(null=True, blank=True)

    class Meta:
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.notification_type}: {self.title[:50]}"

"""Models for Google Calendar booking orchestration."""

from django.db import models

from apps.chat.models import Conversation
from apps.common.models import BaseModel


class CalendarBookingDraft(BaseModel):
    """Transient scheduling state for a conversation."""

    STATUS_CHOICES = (
        ("pending_selection", "Pending selection"),
        ("confirmed", "Confirmed"),
        ("cancelled", "Cancelled"),
    )

    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="calendar_booking_draft",
    )
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default="pending_selection", db_index=True)
    offered_slots = models.JSONField(default=list, blank=True)
    timezone = models.CharField(max_length=64, default="America/Bogota")
    selected_slot = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveSmallIntegerField(default=30)
    google_event_id = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Calendar booking draft"
        verbose_name_plural = "Calendar booking drafts"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.conversation_id} · {self.status}"

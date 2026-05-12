"""Data models for LinkedIn integration."""

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.linkedin.constants import (
    ACCOUNT_STATUSES,
    FUNNEL_STAGES,
    INVITATION_STATUSES,
    MESSAGE_DIRECTIONS,
    NETWORK_DISTANCES,
    SEARCH_FREQUENCIES,
)


class LinkedInAccount(BaseModel):
    """LinkedIn account connected through Unipile for a user."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="linkedin_account",
    )
    unipile_account_id = models.CharField(max_length=128, unique=True)
    linkedin_user_id = models.CharField(max_length=255, blank=True)
    linkedin_name = models.CharField(max_length=255, blank=True)
    linkedin_profile_url = models.URLField(blank=True)
    status = models.CharField(max_length=32, choices=ACCOUNT_STATUSES, default="disconnected", db_index=True)
    connected_at = models.DateTimeField(null=True, blank=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "LinkedIn Account"
        verbose_name_plural = "LinkedIn Accounts"

    def __str__(self) -> str:
        return f"{self.user} - {self.status}"


class SavedSearch(BaseModel):
    """Periodic or manual saved search for LinkedIn prospects."""

    account = models.ForeignKey(LinkedInAccount, on_delete=models.CASCADE, related_name="saved_searches")
    name = models.CharField(max_length=255)
    keywords = models.CharField(max_length=255)
    job_title = models.CharField(max_length=255, blank=True)
    industry = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    network_distance = models.CharField(max_length=32, choices=NETWORK_DISTANCES, blank=True)
    frequency = models.CharField(max_length=32, choices=SEARCH_FREQUENCIES, default="daily")
    last_executed_at = models.DateTimeField(null=True, blank=True)
    total_results_found = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Saved Search"
        verbose_name_plural = "Saved Searches"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.name


class LinkedInProspect(BaseModel):
    """LinkedIn prospect managed in funnel."""

    account = models.ForeignKey(LinkedInAccount, on_delete=models.CASCADE, related_name="prospects")
    saved_search = models.ForeignKey(
        SavedSearch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prospects",
    )
    crm_contact = models.ForeignKey(
        "crm.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linkedin_prospects",
    )
    linkedin_profile_id = models.CharField(max_length=255)
    linkedin_profile_url = models.URLField(blank=True)
    full_name = models.CharField(max_length=255)
    headline = models.CharField(max_length=255, blank=True)
    company_name = models.CharField(max_length=255, blank=True)
    job_title = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    profile_picture_url = models.URLField(blank=True)
    network_distance = models.CharField(max_length=32, choices=NETWORK_DISTANCES, default="out_of_network")
    funnel_stage = models.CharField(max_length=64, choices=FUNNEL_STAGES, default="contacted", db_index=True)
    tags = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    conversation_summary = models.TextField(blank=True)
    product_interest = models.CharField(max_length=255, blank=True)
    opportunity_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    opportunity_currency = models.CharField(max_length=8, default="USD", blank=True)
    unipile_chat_id = models.CharField(max_length=255, blank=True)
    invitation_sent_at = models.DateTimeField(null=True, blank=True)
    invitation_accepted_at = models.DateTimeField(null=True, blank=True)
    invitation_status = models.CharField(max_length=32, choices=INVITATION_STATUSES, default="not_sent", db_index=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    last_message_direction = models.CharField(max_length=16, choices=MESSAGE_DIRECTIONS, blank=True)
    is_discarded = models.BooleanField(default=False, db_index=True)

    class Meta:
        verbose_name = "LinkedIn Prospect"
        verbose_name_plural = "LinkedIn Prospects"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["account", "linkedin_profile_id"],
                name="linkedin_unique_prospect_by_account_profile",
            ),
        ]
        indexes = [
            models.Index(fields=["funnel_stage", "invitation_status"]),
            models.Index(fields=["last_message_at"]),
            models.Index(fields=["is_discarded"]),
            models.Index(fields=["account", "saved_search"]),
            models.Index(fields=["linkedin_profile_id"]),
        ]

    def __str__(self) -> str:
        return self.full_name


class ProspectStageLog(BaseModel):
    """Audit trail for prospect funnel stage transitions."""

    prospect = models.ForeignKey(LinkedInProspect, on_delete=models.CASCADE, related_name="stage_logs")
    from_stage = models.CharField(max_length=64, choices=FUNNEL_STAGES, blank=True)
    to_stage = models.CharField(max_length=64, choices=FUNNEL_STAGES)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linkedin_stage_changes",
    )
    reason = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = "Prospect Stage Log"
        verbose_name_plural = "Prospect Stage Logs"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.prospect_id}: {self.from_stage or '-'} -> {self.to_stage}"


class InvitationTemplate(BaseModel):
    """Reusable invitation text template."""

    account = models.ForeignKey(LinkedInAccount, on_delete=models.CASCADE, related_name="invitation_templates")
    name = models.CharField(max_length=120)
    body = models.CharField(max_length=300)
    times_used = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Invitation Template"
        verbose_name_plural = "Invitation Templates"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["account", "name"], name="linkedin_unique_invitation_template_name"),
        ]

    def __str__(self) -> str:
        return self.name


class MessageTemplate(BaseModel):
    """Reusable first-message template."""

    account = models.ForeignKey(LinkedInAccount, on_delete=models.CASCADE, related_name="message_templates")
    name = models.CharField(max_length=120)
    body = models.TextField()
    times_used = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Message Template"
        verbose_name_plural = "Message Templates"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["account", "name"], name="linkedin_unique_message_template_name"),
        ]

    def __str__(self) -> str:
        return self.name


class LinkedInWebhookEvent(BaseModel):
    """Idempotency register for inbound webhook events."""

    event_name = models.CharField(max_length=64, db_index=True)
    external_event_id = models.CharField(max_length=255, unique=True)
    account_external_id = models.CharField(max_length=255, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=32, default="received", db_index=True)

    class Meta:
        verbose_name = "LinkedIn Webhook Event"
        verbose_name_plural = "LinkedIn Webhook Events"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.event_name} ({self.external_event_id})"

"""CRM domain models."""

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import BaseModel


class Company(BaseModel):
    """Company / organization record."""

    name = models.CharField(max_length=255, db_index=True)
    industry = models.CharField(max_length=120, blank=True)
    website = models.URLField(blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=120, blank=True)
    country = models.CharField(max_length=120, blank=True)
    employee_count = models.PositiveIntegerField(null=True, blank=True)
    annual_revenue = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = "Company"
        verbose_name_plural = "Companies"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Contact(BaseModel):
    """CRM contact / lead."""

    SOURCE_CHOICES = (
        ("whatsapp", "WhatsApp"),
        ("manual", "Manual"),
        ("website", "Website"),
        ("referral", "Referral"),
        ("social_media", "Social media"),
        ("cold_call", "Cold call"),
        ("event", "Event"),
        ("other", "Other"),
    )
    INTENT_CHOICES = (
        ("cold", "Cold"),
        ("warm", "Warm"),
        ("hot", "Hot"),
        ("very_hot", "Very hot"),
    )
    LIFECYCLE_CHOICES = (
        ("new_lead", "New lead"),
        ("contacted", "Contacted"),
        ("qualified", "Qualified"),
        ("proposal", "Proposal"),
        ("negotiation", "Negotiation"),
        ("won", "Won"),
        ("lost", "Lost"),
    )

    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120)
    email = models.EmailField(db_index=True)
    phone_number = models.CharField(max_length=40, blank=True)
    whatsapp_number = models.CharField(max_length=40, blank=True)
    company = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contacts",
    )
    position = models.CharField(max_length=120, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="other")
    intent_level = models.CharField(max_length=20, choices=INTENT_CHOICES, default="cold")
    lifecycle_stage = models.CharField(max_length=20, choices=LIFECYCLE_CHOICES, default="new_lead")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_contacts_assigned",
    )
    last_contact_date = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_contacts_created",
    )

    class Meta:
        verbose_name = "Contact"
        verbose_name_plural = "Contacts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["lifecycle_stage", "intent_level"]),
            models.Index(fields=["assigned_to", "last_contact_date"]),
        ]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def days_since_last_contact(self) -> int | None:
        """Days since last recorded contact; None if never contacted."""
        if not self.last_contact_date:
            return None
        delta = timezone.now() - self.last_contact_date
        return max(0, delta.days)

    @property
    def days_since_creation(self) -> int:
        """Days since the contact was created."""
        delta = timezone.now() - self.created_at
        return max(0, delta.days)


class Deal(BaseModel):
    """Sales opportunity / deal."""

    STAGE_CHOICES = (
        ("new_lead", "New lead"),
        ("contacted", "Contacted"),
        ("qualified", "Qualified"),
        ("qualification", "Qualification"),
        ("proposal", "Proposal"),
        ("negotiation", "Negotiation"),
        ("closed_won", "Closed won"),
        ("closed_lost", "Closed lost"),
    )
    SOURCE_CHOICES = (
        ("whatsapp", "WhatsApp"),
        ("manual", "Manual"),
        ("website", "Website"),
        ("referral", "Referral"),
        ("other", "Other"),
    )

    title = models.CharField(max_length=255)
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="deals")
    company = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deals",
    )
    value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="USD")
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default="qualification", db_index=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="other", db_index=True)
    probability = models.PositiveSmallIntegerField(default=0)
    expected_close_date = models.DateField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_deals_assigned",
    )
    description = models.TextField(blank=True)
    lost_reason = models.CharField(max_length=255, blank=True)
    is_stale = models.BooleanField(default=False, db_index=True)

    class Meta:
        verbose_name = "Deal"
        verbose_name_plural = "Deals"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["stage", "assigned_to"]),
        ]

    def __str__(self) -> str:
        return self.title


class Activity(BaseModel):
    """Follow-up activity (call, meeting, etc.)."""

    TYPE_CHOICES = (
        ("call", "Call"),
        ("email", "Email"),
        ("meeting", "Meeting"),
        ("follow_up", "Follow up"),
        ("note", "Note"),
        ("task", "Task"),
        ("whatsapp", "WhatsApp"),
    )

    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="activities")
    deal = models.ForeignKey(
        Deal,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    activity_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="note")
    subject = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    due_date = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_activities_assigned",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_activities_created",
    )

    class Meta:
        verbose_name = "Activity"
        verbose_name_plural = "Activities"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.subject} ({self.activity_type})"


class Document(BaseModel):
    """File attachment linked to CRM entities."""

    contact = models.ForeignKey(
        Contact,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    deal = models.ForeignKey(
        Deal,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to="crm/documents/%Y/%m/")
    file_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    description = models.TextField(blank=True)
    is_global_knowledge = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Disponible como contexto global en RAG para cualquier conversación.",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_documents_uploaded",
    )

    class Meta:
        verbose_name = "Document"
        verbose_name_plural = "Documents"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class LeadEngineConfig(BaseModel):
    """Configurable automation settings for inbound lead orchestration."""

    ASSIGNMENT_CHOICES = (
        ("round_robin", "Round robin"),
        ("least_busy", "Least busy"),
        ("specific_user", "Specific user"),
        ("by_phone_number", "By phone number"),
    )

    auto_create_contact = models.BooleanField(default=True)
    auto_create_deal = models.BooleanField(default=True)
    default_deal_pipeline_stage = models.CharField(max_length=20, default="new_lead")
    default_deal_title_template = models.CharField(max_length=255, default="Lead WhatsApp - {contact_name}")
    auto_create_follow_up = models.BooleanField(default=True)
    max_response_time_minutes = models.PositiveIntegerField(default=60)
    auto_complete_activities_on_reply = models.BooleanField(default=True)
    default_intent_level = models.CharField(max_length=20, choices=Contact.INTENT_CHOICES, default="warm")
    default_lifecycle_stage = models.CharField(max_length=20, choices=Contact.LIFECYCLE_CHOICES, default="new_lead")
    assignment_strategy = models.CharField(max_length=20, choices=ASSIGNMENT_CHOICES, default="round_robin")
    assignment_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="crm_lead_engine_assignment_configs",
    )
    assignment_specific_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_lead_engine_specific_configs",
    )
    notify_on_new_lead = models.BooleanField(default=True)
    notify_on_returning_contact = models.BooleanField(default=False)
    auto_response_template = models.ForeignKey(
        "whatsapp.WhatsAppTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lead_engine_auto_response_configs",
    )

    class Meta:
        verbose_name = "Lead engine configuration"
        verbose_name_plural = "Lead engine configurations"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"LeadEngineConfig {self.id}"


class PipelineAutomationConfig(BaseModel):
    """Config flags for pipeline stage automation triggers."""

    auto_move_on_first_response = models.BooleanField(default=True)
    auto_move_on_meeting = models.BooleanField(default=True)
    auto_move_on_proposal = models.BooleanField(default=True)
    auto_move_on_contract = models.BooleanField(default=True)
    auto_move_on_contract_signed = models.BooleanField(default=True)
    stale_deal_days = models.PositiveIntegerField(default=14)
    auto_close_lost_days = models.PositiveIntegerField(default=45)
    notify_on_stage_change = models.BooleanField(default=True)
    log_auto_movements = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Pipeline automation configuration"
        verbose_name_plural = "Pipeline automation configurations"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"PipelineAutomationConfig {self.id}"


class DealStageHistory(BaseModel):
    """Timeline of deal stage transitions (manual or automated)."""

    TRIGGER_CHOICES = (
        ("manual", "Manual"),
        ("first_response", "First response"),
        ("meeting_scheduled", "Meeting scheduled"),
        ("proposal_sent", "Proposal sent"),
        ("contract_created", "Contract created"),
        ("contract_signed", "Contract signed"),
        ("stale_timeout", "Stale timeout"),
        ("lead_created", "Lead created"),
    )

    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="stage_history")
    from_stage = models.CharField(max_length=20, blank=True)
    to_stage = models.CharField(max_length=20)
    moved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_deal_stage_movements",
    )
    trigger = models.CharField(max_length=30, choices=TRIGGER_CHOICES, default="manual", db_index=True)
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = "Deal stage history"
        verbose_name_plural = "Deal stage histories"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["deal", "created_at"]),
            models.Index(fields=["trigger", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.deal_id}: {self.from_stage} -> {self.to_stage}"

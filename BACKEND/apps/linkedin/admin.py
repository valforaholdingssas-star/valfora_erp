"""Admin registrations for LinkedIn module."""

from django.contrib import admin

from apps.linkedin.models import (
    InvitationTemplate,
    LinkedInAccount,
    LinkedInProspect,
    LinkedInWebhookEvent,
    MessageTemplate,
    ProspectStageLog,
    SavedSearch,
)


@admin.register(LinkedInAccount)
class LinkedInAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "unipile_account_id", "linkedin_name", "status", "connected_at", "last_sync_at")
    search_fields = ("user__email", "linkedin_name", "unipile_account_id", "linkedin_user_id")
    list_filter = ("status", "is_active")


@admin.register(SavedSearch)
class SavedSearchAdmin(admin.ModelAdmin):
    list_display = ("name", "account", "frequency", "is_active", "last_executed_at", "total_results_found")
    search_fields = ("name", "keywords", "account__user__email")
    list_filter = ("frequency", "is_active")


@admin.register(LinkedInProspect)
class LinkedInProspectAdmin(admin.ModelAdmin):
    list_display = ("full_name", "account", "funnel_stage", "invitation_status", "network_distance", "is_discarded")
    search_fields = ("full_name", "linkedin_profile_id", "company_name", "job_title")
    list_filter = ("funnel_stage", "invitation_status", "network_distance", "is_discarded", "is_active")


@admin.register(ProspectStageLog)
class ProspectStageLogAdmin(admin.ModelAdmin):
    list_display = ("prospect", "from_stage", "to_stage", "changed_by", "created_at")
    list_filter = ("to_stage",)


@admin.register(InvitationTemplate)
class InvitationTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "account", "times_used", "created_at")
    search_fields = ("name", "body")


@admin.register(MessageTemplate)
class MessageTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "account", "times_used", "created_at")
    search_fields = ("name", "body")


@admin.register(LinkedInWebhookEvent)
class LinkedInWebhookEventAdmin(admin.ModelAdmin):
    list_display = ("event_name", "external_event_id", "account_external_id", "status", "created_at", "processed_at")
    search_fields = ("event_name", "external_event_id", "account_external_id")
    list_filter = ("status", "event_name")


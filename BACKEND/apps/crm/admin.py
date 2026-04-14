"""Django admin for CRM models."""

from django.contrib import admin

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


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    """Admin for companies."""

    list_display = ("name", "country", "city", "industry", "is_active", "created_at")
    search_fields = ("name", "industry", "city")


class ActivityInline(admin.TabularInline):
    """Inline activities on contact."""

    model = Activity
    extra = 0
    show_change_link = True


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    """Admin for contacts."""

    inlines = [ActivityInline]
    list_display = (
        "email",
        "first_name",
        "last_name",
        "lifecycle_stage",
        "intent_level",
        "assigned_to",
        "last_contact_date",
        "is_active",
    )
    list_filter = ("lifecycle_stage", "intent_level", "source")
    search_fields = ("email", "first_name", "last_name", "phone_number")
    raw_id_fields = ("company", "assigned_to", "created_by")


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    """Admin for activities."""

    list_display = ("subject", "activity_type", "contact", "is_completed", "created_at")
    list_filter = ("activity_type", "is_completed")
    search_fields = ("subject", "description")
    raw_id_fields = ("contact", "deal", "assigned_to", "created_by")


@admin.register(Deal)
class DealAdmin(admin.ModelAdmin):
    """Admin for deals."""

    list_display = ("title", "stage", "source", "is_stale", "value", "currency", "contact", "assigned_to", "is_active")
    list_filter = ("stage", "source", "is_stale", "currency")
    search_fields = ("title", "description")
    raw_id_fields = ("contact", "company", "assigned_to")


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    """Admin for documents."""

    list_display = ("name", "contact", "deal", "file_size", "uploaded_by", "created_at")
    search_fields = ("name", "description")
    raw_id_fields = ("contact", "deal", "uploaded_by")


@admin.register(LeadEngineConfig)
class LeadEngineConfigAdmin(admin.ModelAdmin):
    """Admin for lead engine automation settings."""

    list_display = ("assignment_strategy", "auto_create_contact", "auto_create_deal", "auto_create_follow_up", "is_active", "updated_at")
    list_filter = ("assignment_strategy", "is_active")
    raw_id_fields = ("assignment_specific_user", "auto_response_template")
    filter_horizontal = ("assignment_users",)


@admin.register(PipelineAutomationConfig)
class PipelineAutomationConfigAdmin(admin.ModelAdmin):
    """Admin for pipeline automation settings."""

    list_display = ("auto_move_on_first_response", "auto_move_on_meeting", "stale_deal_days", "is_active", "updated_at")
    list_filter = ("is_active",)


@admin.register(DealStageHistory)
class DealStageHistoryAdmin(admin.ModelAdmin):
    """Admin for deal stage movement timeline."""

    list_display = ("deal", "from_stage", "to_stage", "trigger", "moved_by", "created_at")
    list_filter = ("trigger", "to_stage")
    raw_id_fields = ("deal", "moved_by")

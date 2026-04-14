"""Celery tasks for CRM."""

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from apps.crm.models import Activity, Contact, Deal
from apps.crm.pipeline_automation import PipelineAutomationService
from apps.crm.services import find_stale_contacts
from apps.notifications.models import Notification

logger = logging.getLogger(__name__)


@shared_task(name="crm.tasks.check_stale_contacts")
def check_stale_contacts() -> int:
    """
    Find contacts without recent touch and log warnings.
    Schedule via django-celery-beat (e.g. daily).
    """
    days = int(getattr(settings, "CRM_STALE_CONTACT_DAYS", 14))
    contacts = find_stale_contacts(days)
    for contact in contacts:
        logger.warning(
            "CRM stale contact: id=%s email=%s assigned_to=%s",
            contact.id,
            contact.email,
            getattr(contact.assigned_to, "email", None),
        )
    return len(contacts)


@shared_task(name="crm.tasks.detect_stale_deals")
def detect_stale_deals() -> int:
    """Mark deals as stale when contact has no touch in configured days."""
    cfg = PipelineAutomationService.get_config()
    threshold = timezone.now() - timedelta(days=cfg.stale_deal_days)
    qs = Deal.objects.filter(is_active=True).exclude(stage__in=["closed_won", "closed_lost"])
    marked = 0
    for deal in qs.select_related("contact"):
        last_touch = deal.contact.last_contact_date or deal.updated_at
        stale = last_touch < threshold
        if deal.is_stale != stale:
            deal.is_stale = stale
            deal.save(update_fields=["is_stale", "updated_at"])
            marked += 1
            if stale:
                Activity.objects.create(
                    contact=deal.contact,
                    deal=deal,
                    activity_type="follow_up",
                    subject=f"Lead frio: {deal.title}",
                    description="Lead sin contacto reciente.",
                    due_date=timezone.now() + timedelta(hours=4),
                    assigned_to=deal.assigned_to or deal.contact.assigned_to,
                    created_by=None,
                )
    return marked


@shared_task(name="crm.tasks.send_stale_notifications")
def send_stale_notifications() -> int:
    """Send daily stale lead summary notification to each assignee."""
    qs = (
        Deal.objects.filter(is_active=True, is_stale=True)
        .exclude(assigned_to__isnull=True)
        .values("assigned_to")
        .annotate(total=Count("id"))
    )
    created = 0
    for row in qs:
        Notification.objects.create(
            recipient_id=row["assigned_to"],
            notification_type="crm_stale_contact",
            title="Leads frios pendientes",
            message=f"Tienes {row['total']} deals sin contacto reciente.",
            action_url="/crm/pipeline",
        )
        created += 1
    return created


@shared_task(name="crm.tasks.auto_close_lost_deals")
def auto_close_lost_deals() -> int:
    """Close stale deals as lost after configured grace period."""
    cfg = PipelineAutomationService.get_config()
    threshold = timezone.now() - timedelta(days=cfg.auto_close_lost_days)
    qs = Deal.objects.filter(is_active=True, is_stale=True, updated_at__lt=threshold).exclude(stage__in=["closed_won", "closed_lost"])
    moved = 0
    for deal in qs:
        result = PipelineAutomationService.move_stage(
            deal=deal,
            to_stage="closed_lost",
            trigger="stale_timeout",
            moved_by=None,
            notes="Auto-cierre por inactividad prolongada.",
        )
        if result.moved:
            moved += 1
    return moved


@shared_task(name="crm.tasks.recalculate_contact_metrics")
def recalculate_contact_metrics() -> int:
    """Recalculate last_contact_date fallback metrics using activities."""
    updated = 0
    for contact in Contact.objects.filter(is_active=True):
        last_activity = (
            Activity.objects.filter(contact=contact, is_active=True)
            .order_by("-created_at")
            .values_list("created_at", flat=True)
            .first()
        )
        if last_activity and (not contact.last_contact_date or last_activity > contact.last_contact_date):
            contact.last_contact_date = last_activity
            contact.save(update_fields=["last_contact_date", "updated_at"])
            updated += 1
    return updated


@shared_task(name="crm.tasks.generate_daily_lead_report")
def generate_daily_lead_report() -> dict:
    """Generate daily lead automation summary payload."""
    since = timezone.now() - timedelta(days=1)
    return {
        "new_whatsapp_leads": Contact.objects.filter(is_active=True, source="whatsapp", created_at__gte=since).count(),
        "new_manual_leads": Contact.objects.filter(is_active=True, source="manual", created_at__gte=since).count(),
        "stale_deals": Deal.objects.filter(is_active=True, is_stale=True).count(),
        "auto_stage_moves": Deal.objects.filter(
            is_active=True,
            stage_history__created_at__gte=since,
            stage_history__moved_by__isnull=True,
        ).count(),
        "generated_at": timezone.now().isoformat(),
    }

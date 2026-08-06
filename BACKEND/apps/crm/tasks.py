"""Celery tasks for CRM."""

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from apps.chat.models import Conversation
from apps.crm.models import Activity, Contact, Deal
from apps.crm.pipeline_automation import PipelineAutomationService
from apps.crm.services import find_stale_contacts
from apps.notifications.models import Notification

logger = logging.getLogger(__name__)


def _collect_business_summary_context(deal: Deal) -> dict:
    conversations = deal.conversations.prefetch_related("messages").order_by("-updated_at")
    line_name = None
    latest_inbound = None
    latest_outbound = None
    user_need = None
    objections = None
    next_step = None
    transcript: list[str] = []

    for conv in conversations[:2]:
        if conv.channel == "whatsapp" and conv.whatsapp_phone_number:
            line_name = line_name or (
                conv.whatsapp_phone_number.internal_name
                or conv.whatsapp_phone_number.verified_name
                or conv.whatsapp_phone_number.display_phone_number
            )
        for msg in conv.messages.filter(is_active=True).order_by("-created_at")[:8]:
            content = (msg.content or "").strip()
            if not content:
                continue
            label = "Contacto" if msg.sender_type == "contact" else "Equipo"
            transcript.append(f"{label}: {content[:220]}")
            if msg.sender_type == "contact":
                latest_inbound = latest_inbound or content[:280]
                user_need = user_need or content[:220]
                if not objections and len(content) > 35:
                    objections = content[:220]
            elif msg.sender_type in {"user", "ai_bot"}:
                latest_outbound = latest_outbound or content[:280]
                if not next_step and len(content) > 35:
                    next_step = content[:220]

    return {
        "line_name": line_name,
        "latest_inbound": latest_inbound,
        "latest_outbound": latest_outbound,
        "user_need": user_need,
        "objections": objections,
        "next_step": next_step,
        "transcript": transcript[:10],
    }


def _build_fallback_business_summary(deal: Deal) -> str:
    context = _collect_business_summary_context(deal)
    lines = ["Resumen comercial"]
    lines.append(f"Negocio: {deal.title}")
    lines.append(f"Contacto: {deal.contact}")
    lines.append(f"Empresa: {deal.company.name if deal.company_id else 'Sin empresa asignada'}")
    lines.append(f"Etapa actual: {deal.stage}")
    lines.append(f"Valor estimado: {deal.value} {deal.currency}")
    if context["line_name"]:
        lines.append(f"Canal principal: {context['line_name']}")
    if context["user_need"]:
        lines.append(f"Necesidad detectada: {context['user_need']}")
    if context["objections"] and context["objections"] != context["user_need"]:
        lines.append(f"Detalle u objeción clave: {context['objections']}")
    if context["latest_outbound"]:
        lines.append(f"Última gestión del equipo: {context['latest_outbound']}")
    if context["next_step"]:
        lines.append(f"Siguiente paso sugerido: {context['next_step']}")
    elif deal.stage == PipelineAutomationService.get_follow_up_stage_key():
        lines.append("Siguiente paso sugerido: realizar llamada de seguimiento y reconfirmar interés.")
    elif context["latest_inbound"]:
        lines.append("Siguiente paso sugerido: retomar contacto sobre el último interés expresado por el lead.")
    return "\n".join(lines)


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
    qs = Deal.objects.filter(is_active=True).exclude(stage__in=PipelineAutomationService.get_closed_stage_keys())
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
    qs = Deal.objects.filter(is_active=True, is_stale=True, updated_at__lt=threshold).exclude(
        stage__in=PipelineAutomationService.get_closed_stage_keys()
    )
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


@shared_task(name="crm.tasks.generate_business_summary_for_deal")
def generate_business_summary_for_deal(deal_id: str) -> bool:
    """Generate or refresh business notes for a deal after key stage transitions."""
    try:
        deal = Deal.objects.select_related("contact", "company").get(pk=deal_id, is_active=True)
    except Deal.DoesNotExist:
        return False

    summary = _build_fallback_business_summary(deal)
    if not summary.strip():
        return False

    deal.business_notes = summary
    deal.save(update_fields=["business_notes", "updated_at"])
    return True


@shared_task(name="crm.tasks.advance_closed_whatsapp_conversations")
def advance_closed_whatsapp_conversations() -> int:
    """Archive expired WhatsApp conversations and move their deals into the follow-up call stage."""
    target_stage = PipelineAutomationService.get_follow_up_stage_key()
    now = timezone.now()
    moved = 0
    qs = (
        Conversation.objects.filter(
            is_active=True,
            channel="whatsapp",
            status="active",
            customer_service_window_expires__lt=now,
            last_inbound_message_at__isnull=False,
            deal__isnull=False,
            deal__is_active=True,
            deal__source="whatsapp",
        )
        .select_related("deal", "contact")
        .order_by("customer_service_window_expires")
    )
    for conversation in qs:
        if conversation.status != "archived":
            conversation.status = "archived"
            conversation.closed_at = conversation.closed_at or now
            conversation.save(update_fields=["status", "closed_at", "updated_at"])

        deal = conversation.deal
        if PipelineAutomationService.normalize_stage(deal.stage) == target_stage:
            generate_business_summary_for_deal.delay(str(deal.id))
            continue
        result = PipelineAutomationService.move_stage(
            deal=deal,
            to_stage=target_stage,
            trigger="chat_window_closed",
            moved_by=None,
            notes="Conversación cerrada con ventana de WhatsApp vencida.",
        )
        if result.moved:
            moved += 1
    return moved

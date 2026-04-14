"""CRM business logic."""

from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.crm.models import Activity, Contact, Deal


def build_contact_timeline(contact_id) -> list[dict[str, Any]]:
    """Return chronological activity rows for a contact."""
    qs = (
        Activity.objects.filter(contact_id=contact_id, is_active=True)
        .select_related("deal", "assigned_to", "created_by")
        .order_by("-created_at")
    )
    return [
        {
            "id": str(a.id),
            "activity_type": a.activity_type,
            "subject": a.subject,
            "description": a.description,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
            "is_completed": a.is_completed,
            "created_at": a.created_at.isoformat(),
            "deal_id": str(a.deal_id) if a.deal_id else None,
        }
        for a in qs
    ]


def build_crm_dashboard() -> dict[str, Any]:
    """Aggregate metrics for the CRM dashboard."""
    active_deals = Deal.objects.filter(is_active=True).exclude(stage__in=("closed_won", "closed_lost"))
    pipeline_by_stage: dict[str, dict[str, Any]] = {}
    stage_qs = active_deals.values("stage").annotate(total=Sum("value"), count=Count("id"))
    for row in stage_qs:
        stage = row["stage"]
        pipeline_by_stage[stage] = {
            "count": row["count"],
            "value": str(row["total"] or Decimal("0")),
        }

    deals_by_owner = (
        Deal.objects.filter(is_active=True)
        .values("assigned_to__email")
        .annotate(count=Count("id"), total=Sum("value"))
        .order_by("-total")[:10]
    )
    recent_activities = (
        Activity.objects.filter(is_active=True)
        .select_related("contact")
        .order_by("-created_at")[:15]
    )
    recent = [
        {
            "id": str(a.id),
            "subject": a.subject,
            "activity_type": a.activity_type,
            "contact_name": str(a.contact),
            "created_at": a.created_at.isoformat(),
        }
        for a in recent_activities
    ]

    # Simple conversion funnel: count deals ever in each stage (active + closed)
    funnel = (
        Deal.objects.filter(is_active=True)
        .values("stage")
        .annotate(count=Count("id"))
    )
    funnel_map = {row["stage"]: row["count"] for row in funnel}

    return {
        "pipeline_by_stage": pipeline_by_stage,
        "deals_by_assignee": list(deals_by_owner),
        "recent_activities": recent,
        "funnel_by_stage": funnel_map,
        "generated_at": timezone.now().isoformat(),
    }


def find_stale_contacts(days: int) -> list[Contact]:
    """Contacts with no touch in `days` or more (uses last_contact_date)."""
    threshold = timezone.now() - timedelta(days=days)
    return list(
        Contact.objects.filter(is_active=True)
        .filter(Q(last_contact_date__isnull=True) | Q(last_contact_date__lt=threshold))
        .select_related("assigned_to")
    )

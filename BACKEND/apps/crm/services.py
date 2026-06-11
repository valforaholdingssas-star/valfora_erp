"""CRM business logic."""

from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.crm.models import Activity, Company, Contact, Deal


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


def build_crm_dashboard(company_id: str | None = None) -> dict[str, Any]:
    """Aggregate metrics for the CRM dashboard."""
    deals_qs = Deal.objects.filter(is_active=True)
    if company_id:
        deals_qs = deals_qs.filter(company_id=company_id)

    active_deals = deals_qs.exclude(stage__in=("closed_won", "closed_lost"))
    active_deals_total = active_deals.count()
    active_deals_value = active_deals.aggregate(total=Sum("value")).get("total") or Decimal("0")
    pipeline_by_stage: dict[str, dict[str, Any]] = {}
    stage_qs = active_deals.values("stage").annotate(total=Sum("value"), count=Count("id"))
    for row in stage_qs:
        stage = row["stage"]
        pipeline_by_stage[stage] = {
            "count": row["count"],
            "value": str(row["total"] or Decimal("0")),
        }

    deals_by_owner = (
        deals_qs
        .values("assigned_to__email")
        .annotate(count=Count("id"), total=Sum("value"))
        .order_by("-total")[:10]
    )
    recent_activities = (
        Activity.objects.filter(is_active=True)
        .filter(Q(deal__in=deals_qs) if company_id else Q())
        .select_related("contact", "deal", "deal__company")
        .order_by("-created_at")[:15]
    )
    recent = [
        {
            "id": str(a.id),
            "subject": a.subject,
            "activity_type": a.activity_type,
            "contact_name": str(a.contact),
            "deal_id": str(a.deal_id) if a.deal_id else "",
            "deal_title": a.deal.title if a.deal_id else "",
            "company_name": a.deal.company.name if a.deal_id and a.deal.company_id else "",
            "created_at": a.created_at.isoformat(),
        }
        for a in recent_activities
    ]

    # Simple conversion funnel: count deals ever in each stage (active + closed)
    funnel = (
        deals_qs
        .values("stage")
        .annotate(count=Count("id"))
    )
    funnel_map = {row["stage"]: row["count"] for row in funnel}

    by_company = (
        Deal.objects.filter(is_active=True)
        .values("company_id", "company__name")
        .annotate(count=Count("id"), total=Sum("value"))
        .order_by("-total", "-count")
    )
    company_stage_rows = (
        Deal.objects.filter(is_active=True)
        .exclude(stage__in=("closed_won", "closed_lost"))
        .values("company_id", "company__name", "stage")
        .annotate(count=Count("id"), total=Sum("value"))
        .order_by("company__name", "stage")
    )
    companies_map = {
        str(c.id): c.name for c in Company.objects.filter(is_active=True).only("id", "name")
    }
    company_stage_map: dict[str, dict[str, dict[str, Any]]] = {}
    for row in company_stage_rows:
        key = str(row["company_id"] or "")
        company_stage_map.setdefault(key, {})
        company_stage_map[key][row["stage"]] = {
            "count": row["count"],
            "value": str(row["total"] or Decimal("0")),
        }
    by_company_rows = [
        {
            "company_id": str(row["company_id"]) if row["company_id"] else "",
            "company_name": row["company__name"] or "Sin empresa",
            "count": row["count"],
            "value": str(row["total"] or Decimal("0")),
            "pipeline_by_stage": company_stage_map.get(str(row["company_id"] or ""), {}),
        }
        for row in by_company
    ]

    return {
        "summary": {
            "active_count": active_deals_total,
            "active_value": str(active_deals_value),
            "total_count": deals_qs.count(),
            "won_count": deals_qs.filter(stage="closed_won").count(),
            "lost_count": deals_qs.filter(stage="closed_lost").count(),
        },
        "pipeline_by_stage": pipeline_by_stage,
        "deals_by_assignee": list(deals_by_owner),
        "recent_activities": recent,
        "funnel_by_stage": funnel_map,
        "by_company": by_company_rows,
        "selected_company": {
            "id": company_id or "",
            "name": companies_map.get(company_id or "", "Todas las empresas"),
        },
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

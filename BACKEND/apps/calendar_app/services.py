"""Business logic for calendar aggregated events."""

import json
import logging
from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone

from apps.crm.models import Activity, Contact, Deal

logger = logging.getLogger(__name__)

EVENT_COLORS = {
    "activity": "#0d6efd",
    "deal_close": "#198754",
    "follow_up": "#fd7e14",
    "overdue": "#dc3545",
    "whatsapp_follow_up": "#dc3545",
    "stale_alert": "#6c757d",
    "google_meeting": "#0f766e",
}


def parse_date_bounds(start_date: str | None, end_date: str | None) -> tuple[datetime, datetime]:
    """Parse date bounds and return timezone-aware datetime range."""

    now = timezone.localtime()
    if not start_date:
        start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        parsed_start = datetime.strptime(start_date, "%Y-%m-%d")
        start_dt = timezone.make_aware(datetime.combine(parsed_start.date(), time.min))

    if not end_date:
        end_dt = (start_dt + timedelta(days=31)).replace(hour=23, minute=59, second=59, microsecond=0)
    else:
        parsed_end = datetime.strptime(end_date, "%Y-%m-%d")
        end_dt = timezone.make_aware(datetime.combine(parsed_end.date(), time.max))
    return start_dt, end_dt


def _activity_events(start_dt: datetime, end_dt: datetime, assigned_to: str | None) -> list[dict]:
    filters = Q(is_active=True, due_date__isnull=False, due_date__range=(start_dt, end_dt))
    if assigned_to:
        filters &= Q(assigned_to_id=assigned_to)
    events = []
    for item in Activity.objects.filter(filters).select_related("contact", "deal", "assigned_to"):
        if item.activity_type in {"whatsapp", "follow_up"}:
            event_type = "whatsapp_follow_up"
        else:
            event_type = "overdue" if (not item.is_completed and item.due_date and item.due_date < timezone.now()) else "activity"
        deal_title = item.deal.title if item.deal_id else ""
        contact_name = f"{item.contact.first_name} {item.contact.last_name}".strip()
        assigned_name = ""
        if item.assigned_to:
            full_name = item.assigned_to.get_full_name().strip()
            assigned_name = full_name or item.assigned_to.email or item.assigned_to.username
        events.append(
            {
                "id": f"activity-{item.id}",
                "title": f"{item.subject} · {deal_title}" if deal_title else item.subject,
                "start": item.due_date,
                "end": item.due_date,
                "type": event_type,
                "color": EVENT_COLORS[event_type],
                "url": f"/crm/deals/{item.deal_id}" if item.deal_id else f"/crm/contacts/{item.contact_id}",
                "metadata": {
                    "activity_id": str(item.id),
                    "contact_id": str(item.contact_id),
                    "deal_id": str(item.deal_id) if item.deal_id else None,
                    "deal_title": deal_title,
                    "contact_name": contact_name,
                    "assigned_to_name": assigned_name,
                    "activity_type": item.activity_type,
                    "is_completed": item.is_completed,
                },
            }
        )
    return events


def _stale_alert_events(start_dt: datetime, end_dt: datetime, assigned_to: str | None) -> list[dict]:
    filters = Q(is_active=True, is_stale=True)
    if assigned_to:
        filters &= Q(assigned_to_id=assigned_to)
    events = []
    for deal in Deal.objects.filter(filters).select_related("contact", "company"):
        base_dt = timezone.localtime(deal.updated_at)
        if base_dt < start_dt or base_dt > end_dt:
            continue
        days_without_touch = None
        if deal.contact and deal.contact.last_contact_date:
            days_without_touch = max(0, (timezone.now() - deal.contact.last_contact_date).days)
        events.append(
            {
                "id": f"stale-deal-{deal.id}",
                "title": f"Lead frio: {deal.contact.first_name} {deal.contact.last_name}".strip(),
                "start": base_dt,
                "end": base_dt,
                "type": "stale_alert",
                "color": EVENT_COLORS["stale_alert"],
                "url": f"/crm/deals/{deal.id}",
                "metadata": {
                    "deal_id": str(deal.id),
                    "contact_id": str(deal.contact_id),
                    "deal_title": deal.title,
                    "contact_name": f"{deal.contact.first_name} {deal.contact.last_name}".strip() if deal.contact_id else "",
                    "company_name": deal.company.name if deal.company_id else "",
                    "days_without_touch": days_without_touch,
                    "stage": deal.stage,
                },
            }
        )
    return events


def _deal_close_events(start_dt: datetime, end_dt: datetime, assigned_to: str | None) -> list[dict]:
    filters = Q(is_active=True, expected_close_date__isnull=False, expected_close_date__range=(start_dt.date(), end_dt.date()))
    if assigned_to:
        filters &= Q(assigned_to_id=assigned_to)
    events = []
    for item in Deal.objects.filter(filters).select_related("contact", "company", "assigned_to"):
        start = timezone.make_aware(datetime.combine(item.expected_close_date, time(hour=9)))
        assigned_name = ""
        if item.assigned_to:
            full_name = item.assigned_to.get_full_name().strip()
            assigned_name = full_name or item.assigned_to.email or item.assigned_to.username
        events.append(
            {
                "id": f"deal-close-{item.id}",
                "title": f"Cierre esperado: {item.title}",
                "start": start,
                "end": start,
                "type": "deal_close",
                "color": EVENT_COLORS["deal_close"],
                "url": f"/crm/deals/{item.id}",
                "metadata": {
                    "deal_id": str(item.id),
                    "contact_id": str(item.contact_id),
                    "deal_title": item.title,
                    "contact_name": f"{item.contact.first_name} {item.contact.last_name}".strip() if item.contact_id else "",
                    "company_name": item.company.name if item.company_id else "",
                    "assigned_to_name": assigned_name,
                    "company_id": str(item.company_id) if item.company_id else None,
                    "stage": item.stage,
                    "value": str(item.value),
                    "currency": item.currency,
                },
            }
        )
    return events


def _follow_up_events(start_dt: datetime, end_dt: datetime, assigned_to: str | None, interval_days: int) -> list[dict]:
    filters = Q(is_active=True)
    if assigned_to:
        filters &= Q(assigned_to_id=assigned_to)
    contacts = Contact.objects.filter(filters).select_related("company", "assigned_to")
    events = []
    for item in contacts:
        base_dt = item.last_contact_date or item.created_at
        follow_up_dt = base_dt + timedelta(days=interval_days)
        if follow_up_dt < start_dt or follow_up_dt > end_dt:
            continue
        events.append(
            {
                "id": f"follow-up-{item.id}",
                "title": f"Seguimiento: {item.first_name} {item.last_name}".strip(),
                "start": follow_up_dt,
                "end": follow_up_dt,
                "type": "follow_up",
                "color": EVENT_COLORS["follow_up"],
                "url": f"/crm/contacts/{item.id}",
                "metadata": {
                    "contact_id": str(item.id),
                    "company_id": str(item.company_id) if item.company_id else None,
                    "intent_level": item.intent_level,
                    "lifecycle_stage": item.lifecycle_stage,
                },
            }
        )
    return events


def _google_calendar_events(start_dt: datetime, end_dt: datetime) -> list[dict]:
    """Pull live Google Calendar events when runtime integration is enabled."""
    from apps.ai_config.models import AIRuntimeSettings
    from apps.calendar_app.google_client import get_service_account_token, list_events

    runtime = AIRuntimeSettings.objects.order_by("-updated_at").first()
    if not runtime or not runtime.google_calendar_enabled:
        return []
    if not runtime.google_calendar_id or not (runtime.google_service_account_json or "").strip():
        return []

    try:
        sa = json.loads(runtime.google_service_account_json)
        token = get_service_account_token(sa)
        items = list_events(
            access_token=token,
            calendar_id=runtime.google_calendar_id,
            time_min=start_dt,
            time_max=end_dt,
            timezone=runtime.google_calendar_timezone or "America/Bogota",
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed to load Google Calendar events for ERP calendar view")
        return []

    events: list[dict] = []
    for item in items:
        start_raw = (item.get("start") or {}).get("dateTime") or (item.get("start") or {}).get("date")
        end_raw = (item.get("end") or {}).get("dateTime") or (item.get("end") or {}).get("date")
        if not start_raw:
            continue
        try:
            start = datetime.fromisoformat(str(start_raw).replace("Z", "+00:00"))
            if "T" not in str(start_raw):
                start = timezone.make_aware(datetime.combine(start.date(), time(hour=9)))
            end = (
                datetime.fromisoformat(str(end_raw).replace("Z", "+00:00"))
                if end_raw
                else start + timedelta(minutes=int(runtime.google_slot_minutes or 30))
            )
            if "T" not in str(end_raw or "") and end_raw:
                end = timezone.make_aware(datetime.combine(end.date(), time(hour=10)))
        except ValueError:
            continue
        if timezone.is_naive(start):
            start = timezone.make_aware(start)
        if timezone.is_naive(end):
            end = timezone.make_aware(end)
        events.append(
            {
                "id": f"google-{item.get('id')}",
                "title": item.get("summary") or "Evento Google Calendar",
                "start": start,
                "end": end,
                "type": "google_meeting",
                "color": EVENT_COLORS["google_meeting"],
                "url": item.get("htmlLink") or "/calendar",
                "metadata": {
                    "google_event_id": item.get("id"),
                    "html_link": item.get("htmlLink"),
                    "source": "google_calendar",
                },
            }
        )
    return events


def build_calendar_events(
    start_dt: datetime,
    end_dt: datetime,
    *,
    assigned_to: str | None = None,
    event_types: set[str] | None = None,
    follow_up_interval_days: int = 14,
) -> list[dict]:
    """Aggregate calendar events from CRM entities and Google Calendar."""

    allowed_types = event_types or {
        "activity",
        "deal_close",
        "follow_up",
        "overdue",
        "whatsapp_follow_up",
        "stale_alert",
        "google_meeting",
    }
    output: list[dict] = []

    if "activity" in allowed_types or "overdue" in allowed_types or "whatsapp_follow_up" in allowed_types:
        output.extend(_activity_events(start_dt, end_dt, assigned_to))
    if "deal_close" in allowed_types:
        output.extend(_deal_close_events(start_dt, end_dt, assigned_to))
    if "follow_up" in allowed_types:
        output.extend(_follow_up_events(start_dt, end_dt, assigned_to, follow_up_interval_days))
    if "stale_alert" in allowed_types:
        output.extend(_stale_alert_events(start_dt, end_dt, assigned_to))
    if "google_meeting" in allowed_types and not assigned_to:
        # Google events are team-calendar scoped; skip when filtering by assignee.
        output.extend(_google_calendar_events(start_dt, end_dt))

    return sorted(output, key=lambda event: event["start"])

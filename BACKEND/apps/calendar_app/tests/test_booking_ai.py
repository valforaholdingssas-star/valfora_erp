"""Unit tests for Google Calendar booking helpers."""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.ai_config.models import AIRuntimeSettings
from apps.calendar_app.booking_ai import _confirm_booking, maybe_handle_calendar_booking
from apps.calendar_app.google_client import compute_candidate_slots
from apps.calendar_app.models import CalendarBookingDraft
from apps.chat.models import Conversation, Message
from apps.crm.models import Activity, Contact, Deal


def test_compute_candidate_slots_skips_busy_and_past():
    now = timezone.make_aware(datetime(2026, 5, 12, 8, 0, 0))
    busy_start = timezone.make_aware(datetime(2026, 5, 12, 10, 0, 0))
    busy_end = timezone.make_aware(datetime(2026, 5, 12, 11, 0, 0))
    slots = compute_candidate_slots(
        now_local=now,
        busy_ranges=[(busy_start, busy_end)],
        days_ahead=1,
        slot_minutes=30,
        max_results=10,
    )
    assert slots
    assert all(s >= now + timedelta(hours=2) for s in slots)
    assert all(not (busy_start <= s < busy_end) for s in slots)


@pytest.mark.django_db
def test_confirm_booking_creates_google_event_and_crm_activity(admin_user):
    runtime = AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(
        first_name="Luis",
        last_name="Cliente",
        email="luis@example.com",
        assigned_to=admin_user,
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="Deal Luis",
        contact=contact,
        stage="contacted",
        assigned_to=admin_user,
    )
    conv = Conversation.objects.create(
        contact=contact,
        channel="whatsapp",
        ai_mode_enabled=True,
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="El martes 12/05 11:00",
        message_type="text",
        status="delivered",
    )
    slot = timezone.make_aware(datetime(2026, 5, 12, 11, 0, 0))
    draft = CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_selection",
        offered_slots=[slot.isoformat()],
        duration_minutes=30,
    )

    with (
        patch("apps.calendar_app.booking_ai.get_service_account_token", return_value="token"),
        patch(
            "apps.calendar_app.booking_ai.create_event",
            return_value={"id": "evt-1", "htmlLink": "https://calendar.google.com/event?eid=1"},
        ) as create_mock,
    ):
        reply = _confirm_booking(inbound=inbound, runtime=runtime, draft=draft, slot_iso=slot.isoformat())

    create_mock.assert_called_once()
    draft.refresh_from_db()
    assert draft.status == "confirmed"
    assert draft.google_event_id == "evt-1"
    assert reply.is_ai_generated is True
    assert "agendada" in reply.content.lower()

    activity = Activity.objects.filter(contact=contact, activity_type="meeting").first()
    assert activity is not None
    assert activity.deal_id == deal.id
    assert activity.due_date == slot


@pytest.mark.django_db
def test_maybe_handle_calendar_booking_returns_none_when_disabled():
    AIRuntimeSettings.objects.create(google_calendar_enabled=False)
    contact = Contact.objects.create(first_name="A", last_name="B")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Quiero agendar una reunión",
        message_type="text",
        status="delivered",
    )
    from apps.ai_config.models import AIConfiguration

    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    assert maybe_handle_calendar_booking(inbound=inbound, config=config) is None

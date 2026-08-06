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


def test_compute_candidate_slots_skips_weekends():
    # Friday 15 May 2026 → next days include weekend
    now = timezone.make_aware(datetime(2026, 5, 15, 8, 0, 0))
    slots = compute_candidate_slots(
        now_local=now,
        busy_ranges=[],
        days_ahead=5,
        slot_minutes=30,
        max_results=20,
        weekdays_only=True,
    )
    assert slots
    assert all(s.weekday() < 5 for s in slots)


def test_compute_candidate_slots_prefer_around():
    now = timezone.make_aware(datetime(2026, 5, 11, 8, 0, 0))  # Monday
    prefer = timezone.make_aware(datetime(2026, 5, 14, 15, 0, 0))  # Thursday 15:00
    slots = compute_candidate_slots(
        now_local=now,
        busy_ranges=[],
        days_ahead=7,
        slot_minutes=30,
        max_results=3,
        prefer_around=prefer,
    )
    assert slots
    assert slots[0].date() == prefer.date()


def test_parse_preferred_datetime_spanish_phrases():
    from unittest.mock import patch
    from zoneinfo import ZoneInfo

    from apps.calendar_app.booking_ai import _parse_preferred_datetime

    bogota = ZoneInfo("America/Bogota")
    fake_now = datetime(2026, 8, 6, 16, 0, tzinfo=bogota)
    with patch("apps.calendar_app.booking_ai._now_in_calendar_tz", return_value=fake_now):
        dt = _parse_preferred_datetime("Domingo 09/08 a las 3pm", tz_name="America/Bogota")
        assert dt is not None
        assert dt.year == 2026
        assert dt.month == 8
        assert dt.day == 9
        assert dt.hour == 15

        dt2 = _parse_preferred_datetime("Domingo 09/08 a las 13:00", tz_name="America/Bogota")
        assert dt2 is not None
        assert dt2.hour == 13
        assert dt2.weekday() == 6  # Sunday


@pytest.mark.django_db
def test_pending_selection_weekend_request_reoffers_weekdays(admin_user):
    from apps.ai_config.models import AIConfiguration
    from apps.calendar_app.booking_ai import maybe_handle_calendar_booking
    from zoneinfo import ZoneInfo

    runtime = AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_booking_window_days=10,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Ana", last_name="Lead")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    bogota = ZoneInfo("America/Bogota")
    offered = datetime(2026, 8, 7, 9, 0, tzinfo=bogota)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_selection",
        offered_slots=[offered.isoformat()],
        timezone="America/Bogota",
        duration_minutes=30,
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Domingo 09/08 a las 3pm",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")

    monday_slot = datetime(2026, 8, 10, 10, 0, tzinfo=bogota)
    with (
        patch("apps.calendar_app.booking_ai._infer_calendar_intent", return_value={"intent": "book_slot", "slot_iso": None}),
        patch("apps.calendar_app.booking_ai.get_service_account_token", return_value="token"),
        patch("apps.calendar_app.booking_ai.freebusy_query", return_value=[]),
        patch(
            "apps.calendar_app.booking_ai.compute_candidate_slots",
            return_value=[monday_slot, monday_slot + timedelta(minutes=30)],
        ),
        patch("apps.calendar_app.booking_ai._now_in_calendar_tz", return_value=datetime(2026, 8, 6, 16, 0, tzinfo=bogota)),
    ):
        reply = maybe_handle_calendar_booking(inbound=inbound, config=config)

    assert reply is not None
    assert "fin de semana" in reply.content.lower() or "lunes a viernes" in reply.content.lower()
    assert "elige uno de estos horarios exactos" not in reply.content.lower()
    assert "10/08" in reply.content or "lunes" in reply.content.lower()



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
    # Placeholder/example.com emails are not invited via SA
    assert create_mock.call_args.kwargs.get("attendee_email") is None
    draft.refresh_from_db()
    assert draft.status == "confirmed"
    assert draft.google_event_id == "evt-1"
    assert reply.is_ai_generated is True
    assert "agendada" in reply.content.lower()

    activity = Activity.objects.filter(contact=contact, activity_type="meeting").first()
    assert activity is not None
    assert activity.deal_id == deal.id
    assert activity.due_date == slot


def test_inviteable_attendee_email_filters_whatsapp_placeholders():
    from apps.calendar_app.booking_ai import _inviteable_attendee_email

    assert _inviteable_attendee_email("wa-573507847789@auto.local") is None
    assert _inviteable_attendee_email("user@localhost") is None
    assert _inviteable_attendee_email("real.person@gmail.com") == "real.person@gmail.com"
    assert _inviteable_attendee_email("") is None
    assert _inviteable_attendee_email(None) is None


def test_create_event_retries_without_attendees_on_sa_403(monkeypatch):
    from apps.calendar_app import google_client as gc

    calls = []

    class FakeResp:
        def __init__(self, status_code, text="", payload=None):
            self.status_code = status_code
            self.text = text
            self._payload = payload or {}

        def raise_for_status(self):
            if self.status_code >= 400:
                raise gc.requests.HTTPError(f"{self.status_code}", response=self)

        def json(self):
            return self._payload

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "json": json})
        if json and json.get("attendees"):
            return FakeResp(
                403,
                text='{"error":{"errors":[{"reason":"forbiddenForServiceAccounts"}],"message":"Service accounts cannot invite attendees without Domain-Wide Delegation of Authority."}}',
            )
        return FakeResp(200, payload={"id": "evt-ok", "htmlLink": "https://x"})

    monkeypatch.setattr(gc.requests, "post", fake_post)
    start = timezone.make_aware(datetime(2026, 8, 7, 11, 0, 0))
    end = start + timedelta(minutes=30)
    out = gc.create_event(
        access_token="t",
        calendar_id="cal@x.com",
        summary="Cita",
        description="desc",
        start_dt=start,
        end_dt=end,
        timezone="America/Bogota",
        attendee_email="guest@somewhere.com",
    )
    assert out["id"] == "evt-ok"
    assert len(calls) == 2
    assert "attendees" in calls[0]["json"]
    assert "attendees" not in calls[1]["json"]


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

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

    from apps.calendar_app.booking_ai import _parse_preferred_datetime, _parse_preferred_day, _resolve_weekday_date

    bogota = ZoneInfo("America/Bogota")
    # Thursday 6 Aug 2026
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

        # Thursday → viernes = tomorrow (7 Aug)
        assert _parse_preferred_day("el viernes", tz_name="America/Bogota").isoformat() == "2026-08-07"
        # Thursday → martes = next week (11 Aug)
        assert _parse_preferred_day("martes", tz_name="America/Bogota").isoformat() == "2026-08-11"

    assert _resolve_weekday_date(4, now=fake_now).date().isoformat() == "2026-08-07"  # viernes
    assert _resolve_weekday_date(1, now=fake_now).date().isoformat() == "2026-08-11"  # martes


@pytest.mark.django_db
def test_affirmation_asks_for_day_not_slots(admin_user, monkeypatch):
    from apps.ai_config.models import AIConfiguration

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Ana", last_name="Lead")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    Message.objects.create(
        conversation=conv,
        sender_type="ai_bot",
        content="¿Agendamos una reunión de 30 minutos?",
        message_type="text",
        status="sent",
        is_ai_generated=True,
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Dale",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    with patch(
        "apps.calendar_app.booking_ai._infer_calendar_intent",
        return_value={"intent": "none", "slot_iso": None},
    ):
        reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    assert reply is not None
    assert "qué día" in reply.content.lower() or "que dia" in reply.content.lower()
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status == "pending_day"


@pytest.mark.django_db
def test_pending_day_friday_asks_morning_or_afternoon(admin_user, monkeypatch):
    from apps.ai_config.models import AIConfiguration
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Ana", last_name="Lead")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_day",
        timezone="America/Bogota",
        duration_minutes=30,
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="el viernes",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    bogota = ZoneInfo("America/Bogota")
    with patch(
        "apps.calendar_app.booking_ai._now_in_calendar_tz",
        return_value=datetime(2026, 8, 6, 16, 0, tzinfo=bogota),
    ):
        reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    assert reply is not None
    assert "mañana" in reply.content.lower() and "tarde" in reply.content.lower()
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status == "pending_period"
    assert draft.metadata.get("preferred_day") == "2026-08-07"


@pytest.mark.django_db
def test_day_and_time_free_asks_email(admin_user, monkeypatch):
    from apps.ai_config.models import AIConfiguration
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(
        first_name="Lucia",
        last_name="A",
        email="wa-573507847789@auto.local",
    )
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_day",
        timezone="America/Bogota",
        duration_minutes=30,
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="el martes a las 3pm",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    bogota = ZoneInfo("America/Bogota")
    with (
        patch(
            "apps.calendar_app.booking_ai._now_in_calendar_tz",
            return_value=datetime(2026, 8, 6, 16, 0, tzinfo=bogota),
        ),
        patch("apps.calendar_app.booking_ai._is_preferred_slot_free", return_value=True),
    ):
        reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    assert reply is not None
    assert "correo" in reply.content.lower()
    assert "ya te agendo" in reply.content.lower()
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status == "pending_email"


@pytest.mark.django_db
def test_pending_selection_weekend_request_reoffers_weekdays(admin_user, monkeypatch):
    from apps.ai_config.models import AIConfiguration
    from apps.calendar_app.booking_ai import maybe_handle_calendar_booking
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
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


def test_parse_email_from_text():
    from apps.calendar_app.booking_ai import _parse_email_from_text

    assert _parse_email_from_text("Mi correo es lucia.a@gmail.com gracias") == "lucia.a@gmail.com"
    assert _parse_email_from_text("wa-123@auto.local") is None


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
        if "meet.googleapis.com" in url:
            return FakeResp(200, payload={"meetingUri": "https://meet.google.com/aaa-bbbb-ccc", "name": "spaces/x"})
        if json and json.get("attendees"):
            return FakeResp(
                403,
                text='{"error":{"errors":[{"reason":"forbiddenForServiceAccounts"}],"message":"Service accounts cannot invite attendees without Domain-Wide Delegation of Authority."}}',
            )
        return FakeResp(
            200,
            payload={
                "id": "evt-ok",
                "htmlLink": "https://x",
                "hangoutLink": "https://meet.google.com/aaa-bbbb-ccc",
                "attendees": [],
            },
        )

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
        add_google_meet=True,
    )
    assert out["id"] == "evt-ok"
    assert out.get("_meet_uri") == "https://meet.google.com/aaa-bbbb-ccc"
    assert "conferenceDataVersion=1" in calls[-1]["url"]
    # First calendar post had attendees; retry without
    cal_calls = [c for c in calls if "calendar" in c["url"]]
    assert len(cal_calls) >= 2
    assert "attendees" in cal_calls[0]["json"]
    assert "attendees" not in cal_calls[1]["json"]
    assert cal_calls[1]["json"].get("conferenceData")


@pytest.mark.django_db
def test_request_email_before_confirm_when_contact_has_placeholder(admin_user, monkeypatch):
    from apps.ai_config.models import AIConfiguration
    from apps.calendar_app.booking_ai import maybe_handle_calendar_booking
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(
        first_name="Lucia",
        last_name="A",
        email="wa-573507847789@auto.local",
    )
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    bogota = ZoneInfo("America/Bogota")
    slot = datetime(2026, 8, 7, 11, 0, tzinfo=bogota)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_selection",
        offered_slots=[slot.isoformat()],
        timezone="America/Bogota",
        duration_minutes=30,
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="El viernes 07/08 a las 11:00",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    with patch("apps.calendar_app.booking_ai._is_preferred_slot_free", return_value=True):
        reply = maybe_handle_calendar_booking(inbound=inbound, config=config)

    assert reply is not None
    assert "correo" in reply.content.lower()
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status == "pending_email"


@pytest.mark.django_db
def test_info_request_does_not_start_calendar(admin_user, monkeypatch):
    from apps.ai_config.models import AIConfiguration

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Ronaldo", last_name="R")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="¡Hola! Quiero más información.",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    assert maybe_handle_calendar_booking(inbound=inbound, config=config) is None


@pytest.mark.django_db
def test_pending_selection_other_week_asks_day(admin_user, monkeypatch):
    from apps.ai_config.models import AIConfiguration
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Camilo", last_name="C")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    bogota = ZoneInfo("America/Bogota")
    slot = datetime(2026, 8, 7, 9, 0, tzinfo=bogota)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_selection",
        offered_slots=[slot.isoformat()],
        timezone="America/Bogota",
        duration_minutes=30,
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Si prefiero la otra semana",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    assert reply is not None
    assert "próxima semana" in reply.content.lower() or "proxima semana" in reply.content.lower()
    assert "qué día" in reply.content.lower() or "que dia" in reply.content.lower()
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status == "pending_day"


def test_nlu_merge_promotes_start_booking_when_day_and_period_present():
    from apps.calendar_app.booking_nlu import _merge_interpretations

    llm = {
        "related": True,
        "action": "start_booking",
        "weekday": "martes",
        "date_iso": "2026-08-11",
        "period": "afternoon",
        "time_hhmm": None,
        "week_offset_days": 0,
        "email": None,
        "slot_iso": None,
        "confidence": 0.8,
    }
    hint = {
        "related": True,
        "action": "provide_day",
        "weekday": "martes",
        "date_iso": "2026-08-11",
        "period": "afternoon",
    }
    merged = _merge_interpretations(llm, hint)
    assert merged["action"] == "provide_day"
    assert merged["period"] == "afternoon"
    assert merged["weekday"] == "martes"


def test_nlu_merge_prefers_llm_datetime_and_fills_gaps():
    from apps.calendar_app.booking_nlu import _merge_interpretations

    llm = {
        "related": True,
        "action": "provide_day",
        "weekday": "martes",
        "date_iso": None,
        "period": None,
        "time_hhmm": None,
        "week_offset_days": 0,
        "email": None,
        "slot_iso": None,
        "confidence": 0.9,
    }
    hint = {"time_hhmm": "15:00", "related": True, "action": "provide_datetime"}
    merged = _merge_interpretations(llm, hint)
    assert merged["weekday"] == "martes"
    assert merged["time_hhmm"] == "15:00"
    assert merged["action"] == "provide_datetime"


def test_looks_like_invented_slot_offer():
    from apps.calendar_app.booking_ai import looks_like_invented_slot_offer

    assert looks_like_invented_slot_offer(
        "Perfecto, te propongo estos horarios disponibles:\n- viernes 07/08 09:00\n- viernes 07/08 09:30"
    )
    assert not looks_like_invented_slot_offer("¡Hola! ¿En qué puedo ayudarte hoy?")


@pytest.mark.django_db
def test_nlu_layer_handles_colloquial_next_week(admin_user, monkeypatch):
    """LLM interprets colloquial phrasing; state machine only sees structured params."""
    from apps.ai_config.models import AIConfiguration
    from zoneinfo import ZoneInfo

    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Camilo", last_name="C")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    bogota = ZoneInfo("America/Bogota")
    slot = datetime(2026, 8, 7, 9, 0, tzinfo=bogota)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_selection",
        offered_slots=[slot.isoformat()],
        timezone="America/Bogota",
        duration_minutes=30,
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="mejor la semanita que viene si se puede",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")

    def fake_interpret(**kwargs):
        return {
            "related": True,
            "action": "defer_week",
            "weekday": None,
            "date_iso": None,
            "period": None,
            "time_hhmm": None,
            "week_offset_days": 7,
            "email": None,
            "slot_iso": None,
            "confidence": 0.95,
            "source": "llm",
        }

    monkeypatch.setattr("apps.calendar_app.booking_ai.interpret_booking_utterance", fake_interpret)
    reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    assert reply is not None
    assert "semana" in reply.content.lower()
    assert CalendarBookingDraft.objects.get(conversation=conv).status == "pending_day"


@pytest.mark.django_db
def test_pending_email_day_change_escapes_email_loop(admin_user, monkeypatch):
    """Client can reschedule while waiting for email instead of being nagged for correo."""
    from apps.ai_config.models import AIConfiguration
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Camilo", last_name="C")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    bogota = ZoneInfo("America/Bogota")
    slot = datetime(2026, 8, 7, 10, 30, tzinfo=bogota)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_email",
        offered_slots=[slot.isoformat()],
        selected_slot=slot,
        timezone="America/Bogota",
        duration_minutes=30,
        metadata={
            "preferred_day": "2026-08-07",
            "preferred_period": "morning",
            "pending_slot_iso": slot.isoformat(),
            "preferred_day_label": "viernes 07/08",
        },
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="No espera mejor reunamonos el domingo",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    fake_now = datetime(2026, 8, 6, 18, 36, tzinfo=bogota)
    with patch("apps.calendar_app.booking_ai._now_in_calendar_tz", return_value=fake_now):
        reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    assert reply is not None
    assert "correo" not in reply.content.lower()
    assert "lunes a viernes" in reply.content.lower() or "laborable" in reply.content.lower()
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status in {"pending_day", "pending_period"}
    assert not (draft.metadata or {}).get("pending_slot_iso")


@pytest.mark.django_db
def test_day_change_from_pending_selection_asks_period_for_new_day(admin_user, monkeypatch):
    """Changing day must clear stale Tuesday slots and ask morning/afternoon for Thursday."""
    from apps.ai_config.models import AIConfiguration
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Camilo", last_name="C")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    bogota = ZoneInfo("America/Bogota")
    slot = datetime(2026, 8, 11, 14, 0, tzinfo=bogota)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_selection",
        offered_slots=[slot.isoformat()],
        timezone="America/Bogota",
        duration_minutes=30,
        metadata={
            "preferred_day": "2026-08-11",
            "preferred_period": "afternoon",
            "preferred_day_label": "martes 11/08",
        },
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="No ya no puedo el miercoles. El jueves",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    fake_now = datetime(2026, 8, 6, 18, 30, tzinfo=bogota)
    with patch("apps.calendar_app.booking_ai._now_in_calendar_tz", return_value=fake_now):
        reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    assert reply is not None
    assert "jueves" in reply.content.lower()
    assert "martes" not in reply.content.lower()
    assert "14:00" not in reply.content
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status == "pending_period"
    assert draft.metadata.get("preferred_day") == "2026-08-13"  # Thursday after Thu Aug 6
    assert draft.metadata.get("preferred_period") is None
    assert draft.offered_slots == []


@pytest.mark.django_db
def test_hola_does_not_redump_pending_selection_slots(admin_user, monkeypatch):
    from apps.ai_config.models import AIConfiguration
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Camilo", last_name="C")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    bogota = ZoneInfo("America/Bogota")
    slot = datetime(2026, 8, 11, 14, 0, tzinfo=bogota)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="pending_selection",
        offered_slots=[slot.isoformat()],
        timezone="America/Bogota",
        duration_minutes=30,
        metadata={"preferred_day": "2026-08-11", "preferred_period": "afternoon"},
    )
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Hola",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")
    reply = maybe_handle_calendar_booking(inbound=inbound, config=config)
    assert reply is None
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status == "cancelled"


@pytest.mark.django_db
def test_idle_reuses_cancelled_draft_for_day_and_period(admin_user, monkeypatch):
    """Regression: cancelled OneToOne draft must be reused, not INSERT-duplicated."""
    from apps.ai_config.models import AIConfiguration
    from zoneinfo import ZoneInfo

    monkeypatch.setattr("apps.calendar_app.booking_nlu.resolve_openai_api_key", lambda: None)
    monkeypatch.setattr("apps.calendar_app.booking_ai.resolve_openai_api_key", lambda: None)
    AIRuntimeSettings.objects.create(
        google_calendar_enabled=True,
        google_calendar_id="team@example.com",
        google_calendar_timezone="America/Bogota",
        google_slot_minutes=30,
        google_service_account_json='{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"x","token_uri":"https://oauth2.googleapis.com/token"}',
    )
    contact = Contact.objects.create(first_name="Camilo", last_name="C")
    conv = Conversation.objects.create(contact=contact, channel="whatsapp", ai_mode_enabled=True)
    CalendarBookingDraft.objects.create(
        conversation=conv,
        status="cancelled",
        offered_slots=[],
        timezone="America/Bogota",
        duration_minutes=30,
        metadata={"abandoned_reason": "nlu_unrelated"},
    )
    bogota = ZoneInfo("America/Bogota")
    fake_now = datetime(2026, 8, 6, 17, 48, tzinfo=bogota)
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="El martes en la tarde",
        message_type="text",
        status="delivered",
    )
    config = AIConfiguration.objects.create(name="default", is_default=True, llm_model="gpt-4o-mini")

    with (
        patch("apps.calendar_app.booking_ai._now_in_calendar_tz", return_value=fake_now),
        patch("apps.calendar_app.booking_ai.get_service_account_token", return_value="token"),
        patch("apps.calendar_app.booking_ai.freebusy_query", return_value=[]),
    ):
        reply = maybe_handle_calendar_booking(inbound=inbound, config=config)

    assert reply is not None
    assert CalendarBookingDraft.objects.filter(conversation=conv).count() == 1
    draft = CalendarBookingDraft.objects.get(conversation=conv)
    assert draft.status == "pending_selection"
    assert (draft.metadata or {}).get("preferred_period") == "afternoon"
    assert "martes" in reply.content.lower() or "tarde" in reply.content.lower() or "horario" in reply.content.lower()


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

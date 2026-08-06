"""Conversation booking orchestration using Google Calendar availability."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone
from openai import OpenAI

from apps.ai_config.models import AIRuntimeSettings, AIConfiguration
from apps.ai_config.runtime import resolve_openai_api_key
from apps.calendar_app.booking_nlu import interpret_booking_utterance
from apps.calendar_app.google_client import (
    GOOGLE_CAL_SCOPE,
    GOOGLE_EVENT_SCOPES,
    compute_candidate_slots,
    create_event,
    freebusy_query,
    get_service_account_token,
    slot_overlaps_busy,
)
from apps.calendar_app.models import CalendarBookingDraft
from apps.chat.models import Message
from apps.crm.models import Activity, Deal

logger = logging.getLogger(__name__)

WORKDAY_START_HOUR = 9
WORKDAY_END_HOUR = 18

SCHEDULE_KEYWORDS = (
    "agendar",
    "agenda",
    "cita",
    "reunión",
    "reunion",
    "horario",
    "disponible",
    "disponibilidad",
    "llamar",
    "llamada",
    "videocall",
    "meet",
)

AFFIRM_SCHEDULE_PHRASES = (
    "dale",
    "ok",
    "okay",
    "va",
    "vamos",
    "listo",
    "perfecto",
    "de acuerdo",
    "claro",
    "si",
    "sí",
    "sip",
    "sep",
    "bueno",
    "hagamoslo",
    "hagámoslo",
    "me sirve",
    "me late",
    "por supuesto",
    "sale",
    "hecho",
    "si quiero",
    "sí quiero",
    "si por favor",
    "sí por favor",
    "ok dale",
    "si dale",
    "sí dale",
    "dale pues",
    "vamos a eso",
    "quiero agendar",
    "agendemos",
)

EXTERNAL_BOOKING_LINK_RE = re.compile(
    r"(calendly\.com|cal\.com|cal\.com/|tidycal\.com|hubspot\.com/.+meeting|outlook\.office\.com/.+book)",
    re.I,
)

_WEEKDAYS_ES = (
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
)


def _calendar_tz_name(runtime: AIRuntimeSettings | None = None, draft: CalendarBookingDraft | None = None) -> str:
    if runtime and (runtime.google_calendar_timezone or "").strip():
        return runtime.google_calendar_timezone.strip()
    if draft and (draft.timezone or "").strip():
        return draft.timezone.strip()
    return "America/Bogota"


def _tz(tz_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name)
    except Exception:  # noqa: BLE001
        return ZoneInfo("America/Bogota")


def _now_in_calendar_tz(tz_name: str) -> datetime:
    return datetime.now(_tz(tz_name))


def _as_calendar_local(dt: datetime, tz_name: str) -> datetime:
    zone = _tz(tz_name)
    if timezone.is_naive(dt):
        return dt.replace(tzinfo=zone)
    return dt.astimezone(zone)


def _format_slot_label(dt: datetime, tz_name: str = "America/Bogota") -> str:
    local = _as_calendar_local(dt, tz_name)
    return f"{_WEEKDAYS_ES[local.weekday()]} {local.strftime('%d/%m %H:%M')}"


def is_google_calendar_ready(runtime: AIRuntimeSettings | None = None) -> bool:
    runtime = runtime or AIRuntimeSettings.objects.order_by("-updated_at").first()
    if not runtime or not runtime.google_calendar_enabled:
        return False
    return bool((runtime.google_calendar_id or "").strip() and (runtime.google_service_account_json or "").strip())


def contains_external_booking_link(text: str) -> bool:
    return bool(EXTERNAL_BOOKING_LINK_RE.search(text or ""))


def looks_like_invented_slot_offer(text: str) -> bool:
    """Detect LLM replies that dump concrete schedule options without backend booking."""
    low = (text or "").lower()
    if not low:
        return False
    if EXTERNAL_BOOKING_LINK_RE.search(low):
        return True
    has_offer_phrase = any(
        p in low
        for p in (
            "horarios disponibles",
            "te propongo estos horarios",
            "estos horarios",
            "elige uno de estos",
            "dime cuál prefieres",
            "dime cual prefieres",
        )
    )
    time_hits = len(re.findall(r"\b\d{1,2}:\d{2}\b", low))
    weekday_hits = sum(1 for d in _WEEKDAYS_ES if d in low)
    return bool(has_offer_phrase and (time_hits >= 2 or (time_hits >= 1 and weekday_hits >= 1)))


def start_booking_by_asking_day(*, inbound: Message, runtime: AIRuntimeSettings | None = None) -> Message | None:
    """Public entry: begin scheduling by asking for a preferred day (never dump slots)."""
    runtime = runtime or AIRuntimeSettings.objects.order_by("-updated_at").first()
    if not is_google_calendar_ready(runtime):
        return None
    draft = CalendarBookingDraft.objects.filter(conversation=inbound.conversation).first()
    return _ask_preferred_day(inbound=inbound, runtime=runtime, draft=draft)


def google_calendar_system_policy() -> str:
    """Injected into the LLM system prompt when Google Calendar booking is enabled."""
    return (
        "--- Agenda (obligatorio) ---\n"
        "Esta plataforma ya tiene Google Calendar integrado para agendar reuniones con Google Meet.\n"
        "NUNCA envíes ni inventes links de Calendly, Cal.com ni ningún enlace externo de reserva.\n"
        "NUNCA digas “te paso el link” ni menciones herramientas externas de agenda.\n"
        "NUNCA inventes horarios ni listas de disponibilidad: el backend consulta el calendario real.\n"
        "Hay una capa NLU: el cliente puede hablar en lenguaje natural; el backend interpreta y agenda.\n"
        "Flujo: 1) si acepta reunirse, se pregunta el día; 2) mañana o tarde; 3) slots reales; "
        "4) correo para invitación Meet. No adelantes pasos ni inventes opciones."
    )


def _google_token(runtime: AIRuntimeSettings, *, for_events: bool = False) -> str:
    sa = json.loads(runtime.google_service_account_json)
    subject = (getattr(runtime, "google_calendar_delegated_user", None) or "").strip() or None
    scope = GOOGLE_EVENT_SCOPES if for_events else GOOGLE_CAL_SCOPE
    try:
        return get_service_account_token(sa, scope=scope, subject=subject)
    except Exception:
        if not subject:
            raise
        logger.warning("Delegated Google token failed; retrying without impersonation")
        return get_service_account_token(sa, scope=scope, subject=None)


MORNING_END_HOUR = 13  # 09:00–13:00
AFTERNOON_START_HOUR = 13  # 13:00–18:00
_ACTIVE_BOOKING_STATUSES = {"pending_day", "pending_period", "pending_selection", "pending_email"}


def maybe_handle_calendar_booking(*, inbound: Message, config: AIConfiguration) -> Message | None:
    """Handle scheduling flow before standard AI response.

    Architecture:
      user text → NLU interpreter (LLM + deterministic fallback) → structured params
      → booking state machine (day → period → slots → email).
    """
    runtime = AIRuntimeSettings.objects.order_by("-updated_at").first()
    if not is_google_calendar_ready(runtime):
        return None

    conv = inbound.conversation
    text = (inbound.content or "").strip()
    if not text:
        return None

    draft = CalendarBookingDraft.objects.filter(conversation=conv).first()
    status = draft.status if draft and draft.status in _ACTIVE_BOOKING_STATUSES else "idle"
    tz_name = _calendar_tz_name(runtime, draft)
    now_local = _now_in_calendar_tz(tz_name)
    offered = []
    if draft and draft.offered_slots:
        offered = [
            {"iso": str(s), "label": _format_slot_label(datetime.fromisoformat(str(s)), tz_name)}
            for s in draft.offered_slots[:6]
        ]

    hint = _deterministic_booking_hint(
        text=text,
        draft_status=status,
        tz_name=tz_name,
        draft=draft,
        offered_slots=[str(x) for x in (draft.offered_slots or [])] if draft else [],
        model=config.llm_model,
        recent_invite=_recent_assistant_invited_meeting(conv),
    )
    interp = interpret_booking_utterance(
        text=text,
        draft_status=status,
        tz_name=tz_name,
        now_local=now_local,
        offered_slots=offered,
        draft_metadata=(draft.metadata if draft else None),
        model=config.llm_model,
        recent_meeting_invite=_recent_assistant_invited_meeting(conv),
        deterministic_hint=hint,
    )

    if status in _ACTIVE_BOOKING_STATUSES:
        if not interp.get("related") and interp.get("action") not in {
            "provide_day",
            "provide_period",
            "provide_datetime",
            "choose_slot",
            "defer_week",
            "provide_email",
            "clarify",
            "start_booking",
        }:
            if status != "pending_email":
                _abandon_draft(draft, reason="nlu_unrelated")
            return None
        return _dispatch_booking_interpretation(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            interp=interp,
            model=config.llm_model,
        )

    # Idle: only start when NLU says so (or strong deterministic start).
    start_actions = {"provide_day", "provide_datetime", "defer_week", "provide_period"}
    if interp.get("action") == "start_booking" or (
        interp.get("related") and interp.get("action") in start_actions
    ):
        # Reuse the OneToOne draft row (cancelled/confirmed included) — never INSERT a duplicate.
        draft = _ensure_booking_draft(conversation=conv, runtime=runtime, draft=draft)
        has_concrete = bool(
            interp.get("weekday")
            or interp.get("date_iso")
            or interp.get("period")
            or interp.get("time_hhmm")
            or int(interp.get("week_offset_days") or 0)
        )
        if interp.get("action") in start_actions or has_concrete:
            # If LLM said start_booking but already extracted day/period, drive the state machine.
            if interp.get("action") == "start_booking" and has_concrete:
                if interp.get("time_hhmm") and (interp.get("weekday") or interp.get("date_iso")):
                    interp = {**interp, "action": "provide_datetime"}
                elif interp.get("weekday") or interp.get("date_iso"):
                    interp = {**interp, "action": "provide_day"}
                elif interp.get("period"):
                    interp = {**interp, "action": "provide_period"}
                elif int(interp.get("week_offset_days") or 0) >= 7:
                    interp = {**interp, "action": "defer_week"}
            return _dispatch_booking_interpretation(
                inbound=inbound,
                runtime=runtime,
                draft=draft,
                interp=interp,
                model=config.llm_model,
            )
        return _ask_preferred_day(inbound=inbound, runtime=runtime, draft=draft)

    return None


def _deterministic_booking_hint(
    *,
    text: str,
    draft_status: str,
    tz_name: str,
    draft: CalendarBookingDraft | None,
    offered_slots: list[str],
    model: str,
    recent_invite: bool,
) -> dict:
    """Legacy parsers as soft hints for the NLU merger (not the primary gate)."""
    hint: dict = {}
    week = _parse_week_offset_days(text)
    if week:
        hint.update({"related": True, "action": "defer_week", "week_offset_days": week})

    email = _parse_email_from_text(text)
    if email:
        hint.update({"related": True, "action": "provide_email", "email": email})

    period = _parse_day_period(text)
    if period and draft_status in {"pending_period", "pending_day", "pending_selection", "idle"}:
        hint.setdefault("related", True)
        hint.setdefault("action", "provide_period")
        hint["period"] = period

    preferred = _parse_preferred_datetime(text, tz_name=tz_name)
    if preferred and _message_has_explicit_time(text):
        hint.update(
            {
                "related": True,
                "action": "provide_datetime",
                "date_iso": preferred.date().isoformat(),
                "time_hhmm": preferred.strftime("%H:%M"),
                "weekday": _WEEKDAYS_ES[preferred.weekday()],
            }
        )
    else:
        day = _parse_preferred_day(
            text,
            tz_name=tz_name,
            week_offset_days=int((draft.metadata or {}).get("week_offset_days") or 0) if draft else 0,
        )
        if day:
            hint.update(
                {
                    "related": True,
                    "action": "provide_day",
                    "date_iso": day.isoformat(),
                    "weekday": _WEEKDAYS_ES[day.weekday()],
                }
            )

    if offered_slots:
        chosen = _pick_slot_from_text(
            user_text=text,
            offered_slots=offered_slots,
            model=model,
            tz_name=tz_name,
        )
        if chosen:
            hint.update({"related": True, "action": "choose_slot", "slot_iso": chosen})

    if draft_status == "idle" and (
        _has_schedule_intent(text) or (_is_scheduling_affirmation(text) and recent_invite)
    ):
        hint.update({"related": True, "action": "start_booking"})

    if draft_status in _ACTIVE_BOOKING_STATUSES and _is_calendar_flow_message(text, draft_status=draft_status):
        hint.setdefault("related", True)

    return hint


def _datetime_from_interpretation(interp: dict, *, tz_name: str, draft: CalendarBookingDraft | None) -> datetime | None:
    zone = _tz(tz_name)
    now = _now_in_calendar_tz(tz_name)
    week_offset = int(interp.get("week_offset_days") or 0)
    if draft and not week_offset:
        week_offset = int((draft.metadata or {}).get("week_offset_days") or 0)

    date_iso = interp.get("date_iso")
    time_hhmm = interp.get("time_hhmm")
    weekday = interp.get("weekday")

    day = None
    if date_iso:
        try:
            day = datetime.fromisoformat(str(date_iso)).date()
        except ValueError:
            day = None
    elif weekday and weekday in _WEEKDAYS_ES:
        idx = _WEEKDAYS_ES.index(weekday)
        base = now + timedelta(days=max(0, week_offset))
        day = _resolve_weekday_date(idx, now=base).date()
    elif draft and (draft.metadata or {}).get("preferred_day") and time_hhmm:
        try:
            day = datetime.fromisoformat(str(draft.metadata["preferred_day"])).date()
        except ValueError:
            day = None

    if not day or not time_hhmm:
        return None
    try:
        hour_s, minute_s = str(time_hhmm).split(":")[:2]
        hour, minute = int(hour_s), int(minute_s)
    except (TypeError, ValueError):
        return None
    try:
        return datetime(day.year, day.month, day.day, hour, minute, tzinfo=zone)
    except ValueError:
        return None


def _day_from_interpretation(interp: dict, *, tz_name: str, draft: CalendarBookingDraft | None):
    preferred = _datetime_from_interpretation(interp, tz_name=tz_name, draft=draft)
    if preferred:
        return preferred.date()
    date_iso = interp.get("date_iso")
    if date_iso:
        try:
            return datetime.fromisoformat(str(date_iso)).date()
        except ValueError:
            pass
    weekday = interp.get("weekday")
    if weekday and weekday in _WEEKDAYS_ES:
        now = _now_in_calendar_tz(tz_name)
        week_offset = int(interp.get("week_offset_days") or 0)
        if draft and not week_offset:
            week_offset = int((draft.metadata or {}).get("week_offset_days") or 0)
        base = now + timedelta(days=max(0, week_offset))
        return _resolve_weekday_date(_WEEKDAYS_ES.index(weekday), now=base).date()
    return None


def _dispatch_booking_interpretation(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    interp: dict,
    model: str,
) -> Message | None:
    """Apply structured NLU params onto the booking state machine."""
    action = interp.get("action") or "none"
    tz_name = _calendar_tz_name(runtime, draft)
    status = draft.status

    if action == "cancel":
        _abandon_draft(draft, reason="nlu_cancel")
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="Listo, dejamos la agenda en pausa. Cuando quieras retomar, me avisas.",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_cancelled": True, "nlu": interp},
        )

    if action == "defer_week" or int(interp.get("week_offset_days") or 0) >= 7:
        offset = int(interp.get("week_offset_days") or 7)
        draft.status = "pending_day"
        draft.offered_slots = []
        draft.metadata = {
            **(draft.metadata or {}),
            "week_offset_days": offset,
            "preferred_day": None,
            "preferred_period": None,
        }
        draft.save(update_fields=["status", "offered_slots", "metadata", "updated_at"])
        # If they also gave a weekday ("el martes de la otra semana"), continue.
        if interp.get("weekday") or interp.get("date_iso"):
            return _apply_provide_day(inbound=inbound, runtime=runtime, draft=draft, interp=interp)
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="Perfecto, entonces para la próxima semana: ¿qué día te queda bien?",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_day": True, "nlu": interp},
        )

    if status == "pending_email" or action == "provide_email":
        email = _inviteable_attendee_email(interp.get("email")) or _parse_email_from_text(inbound.content or "")
        if email:
            return _handle_pending_email(
                inbound=inbound,
                runtime=runtime,
                draft=draft,
                text=email,
            )
        if status == "pending_email":
            return _handle_pending_email(
                inbound=inbound,
                runtime=runtime,
                draft=draft,
                text=inbound.content or "",
            )

    if action == "provide_datetime" or (interp.get("time_hhmm") and (interp.get("date_iso") or interp.get("weekday") or status in {"pending_day", "pending_period", "pending_selection"})):
        preferred = _datetime_from_interpretation(interp, tz_name=tz_name, draft=draft)
        if preferred:
            preferred = _snap_to_slot_grid(
                preferred,
                minutes=int(runtime.google_slot_minutes or draft.duration_minutes or 30),
            )
            return _try_book_or_suggest(
                inbound=inbound,
                runtime=runtime,
                draft=draft,
                preferred=preferred,
            )

    if action == "choose_slot" or (status == "pending_selection" and interp.get("slot_iso")):
        slot_iso = interp.get("slot_iso")
        offered = [str(x) for x in (draft.offered_slots or [])]
        if slot_iso and slot_iso in offered:
            return _request_email_or_confirm(
                inbound=inbound,
                runtime=runtime,
                draft=draft,
                slot_iso=slot_iso,
            )
        # Try match by interpreted datetime against offered
        preferred = _datetime_from_interpretation(interp, tz_name=tz_name, draft=draft)
        if preferred:
            matched = _match_offered_slot(preferred, offered, tz_name=tz_name)
            if matched:
                return _request_email_or_confirm(
                    inbound=inbound,
                    runtime=runtime,
                    draft=draft,
                    slot_iso=matched,
                )

    # Day+period in one phrase ("martes en la tarde"): resolve day first (chains to slots).
    if action == "provide_day" or (status == "pending_day" and (interp.get("weekday") or interp.get("date_iso"))):
        return _apply_provide_day(inbound=inbound, runtime=runtime, draft=draft, interp=interp)

    if action == "provide_period" or (status == "pending_period" and interp.get("period")):
        if (interp.get("weekday") or interp.get("date_iso")) and not (draft.metadata or {}).get("preferred_day"):
            return _apply_provide_day(inbound=inbound, runtime=runtime, draft=draft, interp=interp)
        return _apply_provide_period(inbound=inbound, runtime=runtime, draft=draft, interp=interp)

    if action == "start_booking":
        return _ask_preferred_day(inbound=inbound, runtime=runtime, draft=draft)

    # Clarify according to current step (conversational, not keyword loop).
    if status == "pending_day":
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="¿Qué día te queda mejor? Puede ser un día de la semana, por ejemplo martes o viernes.",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_day": True, "nlu": interp},
        )
    if status == "pending_period":
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="¿Te acomoda mejor en la mañana o en la tarde?",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_period": True, "nlu": interp},
        )
    if status == "pending_selection":
        draft.status = "pending_day"
        draft.offered_slots = []
        draft.save(update_fields=["status", "offered_slots", "updated_at"])
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="Entendido. ¿Qué día te queda mejor para la reunión?",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_day": True, "nlu": interp},
        )
    if status == "pending_email":
        return _handle_pending_email(inbound=inbound, runtime=runtime, draft=draft, text=inbound.content or "")
    return None


def _apply_provide_day(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    interp: dict,
) -> Message:
    tz_name = _calendar_tz_name(runtime, draft)
    day = _day_from_interpretation(interp, tz_name=tz_name, draft=draft)
    if not day:
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="¿Qué día te queda bien? Por ejemplo: martes, viernes o el 12/08.",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_day": True, "nlu": interp},
        )
    if day.weekday() >= 5:
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="Agendamos de lunes a viernes. ¿Qué día laborable te queda mejor?",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_day": True, "nlu": interp},
        )

    # Day + period in one utterance
    if interp.get("period") and not interp.get("time_hhmm"):
        draft.metadata = {
            **(draft.metadata or {}),
            "preferred_day": day.isoformat(),
            "preferred_day_label": f"{_WEEKDAYS_ES[day.weekday()]} {day.strftime('%d/%m')}",
            "week_offset_days": 0,
        }
        draft.status = "pending_period"
        draft.save(update_fields=["status", "metadata", "updated_at"])
        return _apply_provide_period(inbound=inbound, runtime=runtime, draft=draft, interp=interp)

    draft.status = "pending_period"
    draft.metadata = {
        **(draft.metadata or {}),
        "preferred_day": day.isoformat(),
        "preferred_day_label": f"{_WEEKDAYS_ES[day.weekday()]} {day.strftime('%d/%m')}",
        "week_offset_days": 0,
    }
    draft.save(update_fields=["status", "metadata", "updated_at"])
    label = draft.metadata["preferred_day_label"]
    return Message.objects.create(
        conversation=inbound.conversation,
        sender_type="ai_bot",
        content=f"Claro que sí, para el {label}: ¿te sirve en la mañana o en la tarde?",
        message_type="text",
        status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={"calendar_waiting_period": True, "preferred_day": day.isoformat(), "nlu": interp},
    )


def _apply_provide_period(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    interp: dict,
) -> Message:
    tz_name = _calendar_tz_name(runtime, draft)
    day_iso = (draft.metadata or {}).get("preferred_day")
    if not day_iso:
        return _ask_preferred_day(inbound=inbound, runtime=runtime, draft=draft)
    day = datetime.fromisoformat(day_iso).date()
    period = interp.get("period")
    if period not in {"morning", "afternoon"}:
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="¿Te acomoda mejor en la mañana o en la tarde?",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_period": True, "nlu": interp},
        )
    hour_start, hour_end = (
        (WORKDAY_START_HOUR, MORNING_END_HOUR) if period == "morning" else (AFTERNOON_START_HOUR, WORKDAY_END_HOUR)
    )
    draft.metadata = {**(draft.metadata or {}), "preferred_period": period}
    draft.save(update_fields=["metadata", "updated_at"])
    period_label = "mañana" if period == "morning" else "tarde"
    day_label = (draft.metadata or {}).get("preferred_day_label") or day.isoformat()
    return offer_availability_slots(
        inbound=inbound,
        runtime=runtime,
        draft=draft,
        target_date=datetime(day.year, day.month, day.day, tzinfo=_tz(tz_name)),
        period_start_hour=hour_start,
        period_end_hour=hour_end,
        prefer_around=datetime(day.year, day.month, day.day, hour_start + 1, 0, tzinfo=_tz(tz_name)),
        intro=f"Perfecto, para el {day_label} en la {period_label} tengo estos horarios:",
        fallback_next_days=True,
    )


def _abandon_draft(draft: CalendarBookingDraft, *, reason: str) -> None:
    draft.status = "cancelled"
    draft.metadata = {**(draft.metadata or {}), "abandoned_reason": reason}
    draft.save(update_fields=["status", "metadata", "updated_at"])


def _is_calendar_flow_message(text: str, *, draft_status: str) -> bool:
    """Whether the user message still belongs to the booking funnel."""
    low = (text or "").lower().strip()
    if not low:
        return False
    if draft_status == "pending_email":
        return bool(_parse_email_from_text(text) or _inviteable_attendee_email(low) or "@" in low)
    if _has_schedule_intent(text) or _message_has_explicit_time(text) or _looks_like_slot_choice(text):
        return True
    if _parse_week_offset_days(text) is not None:
        return True
    if _parse_day_period(text):
        return True
    # Day names / hoy / mañana — without requiring full datetime
    if any(d in low for d in _WEEKDAYS_ES) or re.search(r"\b(hoy|mañana|manana)\b", low):
        return True
    if re.search(r"\b\d{1,2}[/-]\d{1,2}\b", low):
        return True
    if draft_status in {"pending_day", "pending_period", "pending_selection"} and _is_scheduling_affirmation(text):
        return True
    # Frustration while mid-booking still counts as in-flow if short
    if draft_status == "pending_selection" and any(
        p in low for p in ("ya te dije", "te dije", "otra semana", "siguiente semana", "proxima semana", "próxima semana")
    ):
        return True
    return False


def _parse_week_offset_days(text: str) -> int | None:
    """Return +7 when user asks for next/other week."""
    low = (text or "").lower()
    if re.search(
        r"(otra|pr[oó]xima|siguiente|la\s+que\s+viene)\s+semana|semana\s+(pr[oó]xima|siguiente|que\s+viene)",
        low,
    ):
        return 7
    if re.search(r"\ben\s+8\s+d[ií]as\b", low):
        return 7
    return None


def _ensure_booking_draft(
    *,
    conversation,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft | None = None,
) -> CalendarBookingDraft:
    """Get or create the single draft per conversation; reset if finished/cancelled."""
    existing = draft or CalendarBookingDraft.objects.filter(conversation=conversation).first()
    tz_name = _calendar_tz_name(runtime, existing)
    if existing is None:
        existing = CalendarBookingDraft(conversation=conversation)
    elif existing.status in {"confirmed", "cancelled"} or existing.status not in _ACTIVE_BOOKING_STATUSES:
        existing.offered_slots = []
        existing.selected_slot = None
        existing.google_event_id = ""
        existing.metadata = {}
    existing.status = "pending_day"
    existing.timezone = tz_name
    existing.duration_minutes = int(runtime.google_slot_minutes or 30)
    existing.offered_slots = []
    existing.save()
    return existing


def _ask_preferred_day(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft | None,
) -> Message:
    conv = inbound.conversation
    draft = _ensure_booking_draft(conversation=conv, runtime=runtime, draft=draft)
    return Message.objects.create(
        conversation=conv,
        sender_type="ai_bot",
        content="¿Qué día te queda bien que tengamos nuestra reunión?",
        message_type="text",
        status="pending" if conv.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={"calendar_waiting_day": True},
    )


def _handle_pending_day(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    text: str,
) -> Message:
    tz_name = _calendar_tz_name(runtime, draft)
    # Day + time in one message → validate and book/suggest
    preferred = _parse_preferred_datetime(text, tz_name=tz_name)
    if preferred and _message_has_explicit_time(text):
        preferred = _snap_to_slot_grid(
            preferred,
            minutes=int(runtime.google_slot_minutes or draft.duration_minutes or 30),
        )
        return _try_book_or_suggest(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            preferred=preferred,
        )

    day = _parse_preferred_day(
        text,
        tz_name=tz_name,
        week_offset_days=int((draft.metadata or {}).get("week_offset_days") or 0),
    )
    if not day:
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content=(
                "Dime un día de la semana (por ejemplo: martes o viernes) "
                "y armamos la reunión."
            ),
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_day": True},
        )

    if day.weekday() >= 5:
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content=(
                "Agendamos de lunes a viernes. "
                "¿Qué día laborable te queda mejor?"
            ),
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_day": True},
        )

    draft.status = "pending_period"
    draft.metadata = {
        **(draft.metadata or {}),
        "preferred_day": day.isoformat(),
        "preferred_day_label": f"{_WEEKDAYS_ES[day.weekday()]} {day.strftime('%d/%m')}",
        "week_offset_days": 0,
    }
    draft.save(update_fields=["status", "metadata", "updated_at"])
    label = draft.metadata["preferred_day_label"]
    return Message.objects.create(
        conversation=inbound.conversation,
        sender_type="ai_bot",
        content=f"Claro que sí, para el {label}: ¿te sirve en la mañana o en la tarde?",
        message_type="text",
        status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={
            "calendar_waiting_period": True,
            "preferred_day": day.isoformat(),
        },
    )


def _handle_pending_period(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    text: str,
) -> Message:
    tz_name = _calendar_tz_name(runtime, draft)
    day_iso = (draft.metadata or {}).get("preferred_day")
    if not day_iso:
        return _ask_preferred_day(inbound=inbound, runtime=runtime, draft=draft)

    day = datetime.fromisoformat(day_iso).date()
    # If they give a concrete time now, book/suggest on that day (or parsed day)
    preferred = _parse_preferred_datetime(text, tz_name=tz_name)
    if preferred and _message_has_explicit_time(text):
        # If they only said a time, anchor to preferred day
        if not _parse_preferred_day(text, tz_name=tz_name) and "hoy" not in text.lower() and "mañana" not in text.lower() and "manana" not in text.lower():
            preferred = preferred.replace(year=day.year, month=day.month, day=day.day)
        preferred = _snap_to_slot_grid(
            preferred,
            minutes=int(runtime.google_slot_minutes or draft.duration_minutes or 30),
        )
        return _try_book_or_suggest(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            preferred=preferred,
        )

    period = _parse_day_period(text)
    if not period:
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="¿Te acomoda mejor en la mañana o en la tarde?",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_period": True},
        )

    hour_start, hour_end = (WORKDAY_START_HOUR, MORNING_END_HOUR) if period == "morning" else (AFTERNOON_START_HOUR, WORKDAY_END_HOUR)
    draft.metadata = {
        **(draft.metadata or {}),
        "preferred_period": period,
    }
    draft.save(update_fields=["metadata", "updated_at"])
    period_label = "mañana" if period == "morning" else "tarde"
    day_label = (draft.metadata or {}).get("preferred_day_label") or day.isoformat()
    return offer_availability_slots(
        inbound=inbound,
        runtime=runtime,
        draft=draft,
        target_date=datetime(day.year, day.month, day.day, tzinfo=_tz(tz_name)),
        period_start_hour=hour_start,
        period_end_hour=hour_end,
        prefer_around=datetime(day.year, day.month, day.day, hour_start + 1, 0, tzinfo=_tz(tz_name)),
        intro=f"Perfecto, para el {day_label} en la {period_label} tengo estos horarios:",
        fallback_next_days=True,
    )


def _handle_pending_selection(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    text: str,
    intent: dict,
    model: str,
) -> Message:
    tz_name = _calendar_tz_name(runtime, draft)
    week_offset = _parse_week_offset_days(text)
    if week_offset:
        draft.status = "pending_day"
        draft.offered_slots = []
        draft.metadata = {
            **(draft.metadata or {}),
            "week_offset_days": week_offset,
            "preferred_day": None,
            "preferred_period": None,
        }
        draft.save(update_fields=["status", "offered_slots", "metadata", "updated_at"])
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content="Perfecto, entonces para la próxima semana: ¿qué día te queda bien?",
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_day": True, "week_offset_days": week_offset},
        )

    offered_slots = [str(x) for x in (draft.offered_slots or [])]
    chosen = intent.get("slot_iso") if intent.get("intent") == "book_slot" else None
    if not chosen:
        chosen = _pick_slot_from_text(
            user_text=text,
            offered_slots=offered_slots,
            model=model,
            tz_name=tz_name,
        )
    if chosen and chosen in offered_slots:
        return _request_email_or_confirm(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            slot_iso=chosen,
        )

    preferred = _parse_preferred_datetime(text, tz_name=tz_name)
    if preferred:
        preferred = _snap_to_slot_grid(
            preferred,
            minutes=int(runtime.google_slot_minutes or draft.duration_minutes or 30),
        )
        matched = _match_offered_slot(preferred, offered_slots, tz_name=tz_name)
        if matched:
            return _request_email_or_confirm(
                inbound=inbound,
                runtime=runtime,
                draft=draft,
                slot_iso=matched,
            )
        return _try_book_or_suggest(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            preferred=preferred,
        )

    # Change day mid-selection
    if _parse_preferred_day(text, tz_name=tz_name):
        return _handle_pending_day(inbound=inbound, runtime=runtime, draft=draft, text=text)

    if intent.get("intent") == "book_slot" or _looks_like_slot_choice(text):
        return offer_availability_slots(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            intro="No identifiqué ese horario. Elige uno de estos:",
        )

    # Don't loop forever — restart day question once.
    draft.status = "pending_day"
    draft.offered_slots = []
    draft.save(update_fields=["status", "offered_slots", "updated_at"])
    return Message.objects.create(
        conversation=inbound.conversation,
        sender_type="ai_bot",
        content="Entendido. ¿Qué día te queda mejor para la reunión?",
        message_type="text",
        status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={"calendar_waiting_day": True, "restarted_from_selection": True},
    )


def _try_book_or_suggest(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    preferred: datetime,
) -> Message:
    tz_name = _calendar_tz_name(runtime, draft)
    preferred = _as_calendar_local(preferred, tz_name)

    if preferred.weekday() >= 5:
        return offer_availability_slots(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            prefer_around=preferred,
            intro=(
                "Agendamos de lunes a viernes. "
                f"El {_format_slot_label(preferred, tz_name)} cae en fin de semana; "
                "te propongo estos horarios cercanos:"
            ),
            fallback_next_days=True,
        )

    if not _within_work_hours(preferred):
        return offer_availability_slots(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            target_date=preferred,
            prefer_around=preferred,
            intro=(
                f"Nuestra jornada es de {WORKDAY_START_HOUR:02d}:00 a {WORKDAY_END_HOUR:02d}:00. "
                "Te propongo estos horarios ese mismo día:"
            ),
            fallback_next_days=True,
        )

    if preferred < _now_in_calendar_tz(tz_name) + timedelta(hours=2):
        return offer_availability_slots(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            prefer_around=preferred,
            intro="Ese horario ya no alcanza (mínimo 2 horas de anticipación). Alternativas:",
            fallback_next_days=True,
        )

    if _is_preferred_slot_free(runtime=runtime, slot_start=preferred, draft=draft):
        return _request_email_or_confirm(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            slot_iso=preferred.isoformat(),
        )

    return offer_availability_slots(
        inbound=inbound,
        runtime=runtime,
        draft=draft,
        target_date=preferred,
        prefer_around=preferred,
        intro=(
            f"El {_format_slot_label(preferred, tz_name)} ya está ocupado. "
            "¿Te sirven estos horarios cercanos?"
        ),
        fallback_next_days=True,
    )


def offer_availability_slots(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings | None = None,
    draft: CalendarBookingDraft | None = None,
    prefer_around: datetime | None = None,
    intro: str | None = None,
    target_date: datetime | None = None,
    period_start_hour: int | None = None,
    period_end_hour: int | None = None,
    fallback_next_days: bool = False,
) -> Message | None:
    """Query Google freeBusy and create an AI message with concrete slot options."""
    runtime = runtime or AIRuntimeSettings.objects.order_by("-updated_at").first()
    if not is_google_calendar_ready(runtime):
        return None

    conv = inbound.conversation
    draft = draft or CalendarBookingDraft.objects.filter(conversation=conv).first()
    tz_name = _calendar_tz_name(runtime, draft)

    try:
        json.loads(runtime.google_service_account_json)
    except json.JSONDecodeError:
        return Message.objects.create(
            conversation=conv,
            sender_type="ai_bot",
            content="La integración de Google Calendar no está bien configurada.",
            message_type="text",
            status="pending" if conv.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_config_error": "invalid_service_account_json"},
        )

    token = _google_token(runtime, for_events=False)
    now_local = _now_in_calendar_tz(tz_name)
    days = int(runtime.google_booking_window_days or 7)
    time_max = now_local + timedelta(days=max(1, days))
    busy = freebusy_query(
        access_token=token,
        calendar_id=runtime.google_calendar_id,
        time_min=now_local,
        time_max=time_max,
        timezone=tz_name,
    )
    slot_minutes = int(runtime.google_slot_minutes or 30)
    slots = compute_candidate_slots(
        now_local=now_local,
        busy_ranges=busy,
        days_ahead=max(1, days),
        slot_minutes=slot_minutes,
        workday_start_hour=WORKDAY_START_HOUR,
        workday_end_hour=WORKDAY_END_HOUR,
        max_results=6,
        weekdays_only=True,
        prefer_around=prefer_around,
        target_date=target_date,
        period_start_hour=period_start_hour,
        period_end_hour=period_end_hour,
    )

    # If the requested day/period is empty, widen to nearby days.
    if not slots and fallback_next_days:
        slots = compute_candidate_slots(
            now_local=now_local,
            busy_ranges=busy,
            days_ahead=max(1, days),
            slot_minutes=slot_minutes,
            workday_start_hour=WORKDAY_START_HOUR,
            workday_end_hour=WORKDAY_END_HOUR,
            max_results=6,
            weekdays_only=True,
            prefer_around=prefer_around or target_date or now_local,
            period_start_hour=period_start_hour,
            period_end_hour=period_end_hour,
        )
        if intro and "ocupado" not in (intro or "").lower() and "cercanos" not in (intro or "").lower():
            intro = (
                f"{intro.rstrip(':')} "
                "(no había cupo en ese bloque; te muestro alternativas cercanas):"
            )

    if not slots:
        return Message.objects.create(
            conversation=conv,
            sender_type="ai_bot",
            content="No encontré espacios disponibles por ahora. ¿Quieres que revisemos otro día?",
            message_type="text",
            status="pending" if conv.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_slots": []},
        )

    offered = [s.isoformat() for s in slots]
    if not draft:
        draft = CalendarBookingDraft(conversation=conv)
    draft.status = "pending_selection"
    draft.offered_slots = offered
    draft.timezone = tz_name
    draft.duration_minutes = slot_minutes
    draft.save()

    choices = "\n".join(f"- {_format_slot_label(s, tz_name)}" for s in slots[:3])
    header = (intro or "Te propongo estos horarios:").strip()
    return Message.objects.create(
        conversation=conv,
        sender_type="ai_bot",
        content=(
            f"{header}\n"
            f"{choices}\n\n"
            "Dime cuál te queda mejor."
        ),
        message_type="text",
        status="pending" if conv.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={
            "calendar_slots": offered[:3],
            "calendar_prefer_around": prefer_around.isoformat() if prefer_around else None,
        },
    )


def _primary_open_deal(contact_id) -> Deal | None:
    return (
        Deal.objects.filter(contact_id=contact_id, is_active=True)
        .exclude(stage__in=["closed_won", "closed_lost"])
        .order_by("-updated_at")
        .first()
    )


def _sync_crm_meeting_activity(
    *,
    contact,
    slot_start: datetime,
    duration_minutes: int,
    google_event_id: str,
    google_html_link: str | None,
) -> Activity | None:
    """Create CRM meeting activity so pipeline + ERP calendar stay in sync."""
    if not contact:
        return None
    deal = _primary_open_deal(contact.id)
    description_parts = [
        "Cita agendada automáticamente por la IA vía Google Calendar.",
        f"Duración: {duration_minutes} minutos.",
    ]
    if google_event_id:
        description_parts.append(f"Google event id: {google_event_id}")
    if google_html_link:
        description_parts.append(f"Enlace: {google_html_link}")
    subject = f"Reunión con {contact.first_name} {contact.last_name}".strip()
    activity = Activity.objects.create(
        contact=contact,
        deal=deal,
        activity_type="meeting",
        subject=subject[:255],
        description="\n".join(description_parts),
        due_date=slot_start,
        assigned_to=deal.assigned_to if deal else contact.assigned_to,
        created_by=None,
    )
    return activity


def _confirm_booking(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    slot_iso: str,
    attendee_email: str | None = None,
) -> Message:
    tz_name = _calendar_tz_name(runtime, draft)
    slot_start = datetime.fromisoformat(slot_iso)
    if timezone.is_naive(slot_start):
        slot_start = slot_start.replace(tzinfo=_tz(tz_name))
    else:
        slot_start = slot_start.astimezone(_tz(tz_name))
    duration_minutes = int(runtime.google_slot_minutes or draft.duration_minutes or 30)
    duration = timedelta(minutes=duration_minutes)
    slot_end = slot_start + duration

    contact = inbound.conversation.contact
    guest_email = _inviteable_attendee_email(
        attendee_email or (draft.metadata or {}).get("guest_email") or getattr(contact, "email", None)
    )
    notes = [
        f"Contacto: {contact.first_name} {contact.last_name}".strip(),
        f"Email: {guest_email or contact.email or 'N/D'}",
        f"Teléfono: {contact.phone_number or contact.whatsapp_number or 'N/D'}",
        f"Conversación: {inbound.conversation_id}",
    ]
    summary = f"Cita con {contact.first_name} {contact.last_name}".strip()

    token = _google_token(runtime, for_events=True)
    event = create_event(
        access_token=token,
        calendar_id=runtime.google_calendar_id,
        summary=summary,
        description="\n".join(notes),
        start_dt=slot_start,
        end_dt=slot_end,
        timezone=tz_name,
        attendee_email=guest_email,
        add_google_meet=True,
        send_updates=True,
    )

    google_event_id = str(event.get("id") or "")
    google_html_link = event.get("htmlLink")
    meet_uri = (event.get("_meet_uri") or event.get("hangoutLink") or "").strip() or None
    invited = bool(event.get("_attendee_invited"))
    activity = None
    try:
        activity = _sync_crm_meeting_activity(
            contact=contact,
            slot_start=slot_start,
            duration_minutes=duration_minutes,
            google_event_id=google_event_id,
            google_html_link=google_html_link,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed to sync CRM meeting activity after Google booking")

    draft.status = "confirmed"
    draft.selected_slot = slot_start
    draft.google_event_id = google_event_id
    draft.metadata = {
        **(draft.metadata or {}),
        "google_event_html_link": google_html_link,
        "google_meet_uri": meet_uri,
        "guest_email": guest_email,
        "attendee_invited": invited,
        "crm_activity_id": str(activity.id) if activity else None,
        "deal_id": str(activity.deal_id) if activity and activity.deal_id else None,
    }
    draft.save(update_fields=["status", "selected_slot", "google_event_id", "metadata", "updated_at"])

    label = _format_slot_label(slot_start, tz_name)
    parts = [f"Listo, tu cita quedó agendada para {label}."]
    if meet_uri:
        parts.append(f"Enlace de Google Meet: {meet_uri}")
    if guest_email and invited:
        parts.append(f"Te enviamos la invitación a {guest_email} para que quede en tu calendario.")
    elif guest_email and not invited:
        parts.append(
            f"Registré tu correo ({guest_email}). "
            "Si no te llega la invitación automática, entra con el enlace de Meet de arriba."
        )
    parts.append("Si necesitas reagendar, avísame.")

    return Message.objects.create(
        conversation=inbound.conversation,
        sender_type="ai_bot",
        content=" ".join(parts),
        message_type="text",
        status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={
            "calendar_booking_confirmed": True,
            "google_event_id": draft.google_event_id,
            "google_meet_uri": meet_uri,
            "attendee_invited": invited,
            "crm_activity_id": str(activity.id) if activity else None,
        },
    )


def _request_email_or_confirm(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    slot_iso: str,
) -> Message:
    """Ask for a real email before booking, or confirm immediately if already known."""
    contact = inbound.conversation.contact
    existing = _inviteable_attendee_email(getattr(contact, "email", None))
    if existing:
        try:
            return _confirm_booking(
                inbound=inbound,
                runtime=runtime,
                draft=draft,
                slot_iso=slot_iso,
                attendee_email=existing,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed confirming booking with existing email")
            return Message.objects.create(
                conversation=inbound.conversation,
                sender_type="ai_bot",
                content=(
                    "Intenté reservar la cita pero hubo un error con el calendario. "
                    "¿Te comparto nuevos horarios?"
                ),
                message_type="text",
                status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
                is_ai_generated=True,
                ai_context_used={"calendar_booking_error": str(exc)},
            )

    tz_name = _calendar_tz_name(runtime, draft)
    slot_start = datetime.fromisoformat(slot_iso)
    if timezone.is_naive(slot_start):
        slot_start = slot_start.replace(tzinfo=_tz(tz_name))
    else:
        slot_start = slot_start.astimezone(_tz(tz_name))

    draft.status = "pending_email"
    draft.selected_slot = slot_start
    draft.metadata = {
        **(draft.metadata or {}),
        "pending_slot_iso": slot_iso,
    }
    draft.save(update_fields=["status", "selected_slot", "metadata", "updated_at"])

    return Message.objects.create(
        conversation=inbound.conversation,
        sender_type="ai_bot",
        content=(
            f"Perfecto, ya te agendo el {_format_slot_label(slot_start, tz_name)}. "
            "¿Me compartes tu correo para enviarte la invitación con Google Meet?"
        ),
        message_type="text",
        status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={
            "calendar_waiting_email": True,
            "pending_slot_iso": slot_iso,
        },
    )


def _handle_pending_email(
    *,
    inbound: Message,
    runtime: AIRuntimeSettings,
    draft: CalendarBookingDraft,
    text: str,
) -> Message:
    email = _parse_email_from_text(text) or _inviteable_attendee_email(text.strip())
    if not email:
        return Message.objects.create(
            conversation=inbound.conversation,
            sender_type="ai_bot",
            content=(
                "Necesito un correo válido para enviarte la invitación "
                "(por ejemplo: nombre@gmail.com)."
            ),
            message_type="text",
            status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
            is_ai_generated=True,
            ai_context_used={"calendar_waiting_email": True},
        )

    contact = inbound.conversation.contact
    if contact and (contact.email or "") != email:
        contact.email = email
        contact.save(update_fields=["email", "updated_at"])

    slot_iso = (draft.metadata or {}).get("pending_slot_iso")
    if not slot_iso and draft.selected_slot:
        slot_iso = draft.selected_slot.isoformat()
    if not slot_iso:
        draft.status = "pending_selection"
        draft.save(update_fields=["status", "updated_at"])
        return offer_availability_slots(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            intro="Gracias por el correo. Elige de nuevo el horario y te confirmo la cita:",
        )

    draft.metadata = {**(draft.metadata or {}), "guest_email": email}
    draft.save(update_fields=["metadata", "updated_at"])
    try:
        return _confirm_booking(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            slot_iso=str(slot_iso),
            attendee_email=email,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed confirming booking after collecting email")
        draft.status = "pending_selection"
        draft.save(update_fields=["status", "updated_at"])
        return offer_availability_slots(
            inbound=inbound,
            runtime=runtime,
            draft=draft,
            intro=(
                "Guardé tu correo, pero hubo un problema al crear el evento. "
                "Elige de nuevo un horario:"
            ),
        )


def _parse_email_from_text(text: str) -> str | None:
    match = re.search(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", text or "", flags=re.I)
    if not match:
        return None
    return _inviteable_attendee_email(match.group(0))


def _has_schedule_intent(text: str) -> bool:
    low = text.lower()
    return any(k in low for k in SCHEDULE_KEYWORDS)


def _normalize_affirmation(text: str) -> str:
    low = (text or "").lower().strip()
    low = re.sub(r"[^\wáéíóúñü\s]", " ", low, flags=re.I)
    return re.sub(r"\s+", " ", low).strip()


def _is_scheduling_affirmation(text: str) -> bool:
    cleaned = _normalize_affirmation(text)
    if not cleaned:
        return False
    if cleaned in AFFIRM_SCHEDULE_PHRASES:
        return True
    tokens = cleaned.split()
    if len(tokens) <= 5 and any(p == cleaned or cleaned.startswith(f"{p} ") or cleaned.endswith(f" {p}") for p in AFFIRM_SCHEDULE_PHRASES):
        return True
    return False


def _looks_like_slot_choice(text: str) -> bool:
    low = (text or "").lower()
    return bool(re.search(r"\b\d{1,2}([:/.]\d{2})?\b", low) or any(d in low for d in _WEEKDAYS_ES))


def _recent_assistant_invited_meeting(conv) -> bool:
    recent = (
        Message.objects.filter(conversation=conv, is_active=True, sender_type="ai_bot")
        .order_by("-created_at")[:4]
    )
    for msg in recent:
        low = (msg.content or "").lower()
        if any(k in low for k in ("agend", "reunión", "reunion", "cita", "30 minutos", "asesoría", "asesoria")):
            return True
    return False


def _within_work_hours(dt: datetime) -> bool:
    return WORKDAY_START_HOUR <= dt.hour < WORKDAY_END_HOUR


def _message_has_explicit_time(text: str) -> bool:
    low = (text or "").lower()
    return bool(
        re.search(r"\b\d{1,2}:\d{2}\b", low)
        or re.search(r"\b\d{1,2}\s*(am|pm)\b", low)
        or re.search(r"a\s+las?\s+\d{1,2}\b", low)
    )


def _parse_day_period(text: str) -> str | None:
    """Interpret morning/afternoon preference (used after the day is already known)."""
    low = (text or "").lower().strip()
    if any(x in low for x in ("tarde", "afternoon")) or re.search(r"\bpm\b", low):
        return "afternoon"
    if any(x in low for x in ("mañana", "manana", "morning")) or re.search(r"\bam\b", low):
        return "morning"
    return None


def _resolve_weekday_date(weekday_idx: int, *, now: datetime) -> datetime:
    """Next occurrence of weekday: this week if still upcoming, else next week.

    Same weekday as today → today if still bookable, otherwise +7 days.
    """
    delta = (weekday_idx - now.weekday()) % 7
    if delta == 0:
        if now.hour < (WORKDAY_END_HOUR - 2):
            return now.replace(hour=0, minute=0, second=0, microsecond=0)
        delta = 7
    target = now + timedelta(days=delta)
    return target.replace(hour=0, minute=0, second=0, microsecond=0)


def _parse_preferred_day(text: str, *, tz_name: str, week_offset_days: int = 0):
    """Parse a day preference into a date (no required time)."""
    from datetime import date

    low = (text or "").lower().strip()
    if not low:
        return None
    now = _now_in_calendar_tz(tz_name)
    base = now + timedelta(days=max(0, int(week_offset_days or 0)))

    if re.search(r"\bhoy\b", low) and week_offset_days <= 0:
        return now.date()
    if re.search(r"\b(mañana|manana)\b", low) and week_offset_days <= 0:
        return (now + timedelta(days=1)).date()

    date_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", low)
    if date_match:
        day = int(date_match.group(1))
        month = int(date_match.group(2))
        year = now.year
        if date_match.group(3):
            year = int(date_match.group(3))
            if year < 100:
                year += 2000
        try:
            candidate = date(year, month, day)
        except ValueError:
            return None
        if candidate < now.date() and not date_match.group(3):
            try:
                candidate = date(year + 1, month, day)
            except ValueError:
                return None
        return candidate

    for idx, name in enumerate(_WEEKDAYS_ES):
        if name in low:
            return _resolve_weekday_date(idx, now=base).date()
    return None


def _infer_calendar_intent(*, user_text: str, model: str) -> dict:
    """
    Deterministic intent only — LLM classification caused false calendar starts
    on messages like "quiero más información".
    """
    low = (user_text or "").lower()
    if any(k in low for k in SCHEDULE_KEYWORDS):
        return {"intent": "check_availability", "slot_iso": None}
    if _message_has_explicit_time(user_text) or (
        _looks_like_slot_choice(user_text) and any(d in low for d in _WEEKDAYS_ES)
    ):
        return {"intent": "book_slot", "slot_iso": None}
    return {"intent": "none", "slot_iso": None}

def _inviteable_attendee_email(email: str | None) -> str | None:
    """Return a real email safe to invite via Google Calendar, else None.

    WhatsApp auto-generated placeholders (e.g. wa-…@auto.local) must not be
    sent as attendees: service accounts cannot invite guests without DWD and
    those addresses are not deliverable anyway.
    """
    value = (email or "").strip().lower()
    if not value or "@" not in value:
        return None
    local, _, domain = value.partition("@")
    if not local or not domain or "." not in domain:
        return None
    blocked_domains = {
        "auto.local",
        "localhost",
        "example.com",
        "example.org",
        "invalid",
        "local",
    }
    if domain in blocked_domains or domain.endswith(".local"):
        return None
    if value.startswith("wa-") and domain.endswith(".local"):
        return None
    return (email or "").strip()


def _snap_to_slot_grid(dt: datetime, *, minutes: int) -> datetime:
    step = max(15, int(minutes or 30))
    minute = (dt.minute // step) * step
    return dt.replace(minute=minute, second=0, microsecond=0)


def _match_offered_slot(preferred: datetime, offered_slots: list[str], *, tz_name: str) -> str | None:
    pref = _as_calendar_local(preferred, tz_name).replace(second=0, microsecond=0)
    for slot in offered_slots:
        local = _as_calendar_local(datetime.fromisoformat(slot), tz_name).replace(second=0, microsecond=0)
        if local == pref:
            return slot
    return None


def _is_preferred_slot_free(
    *,
    runtime: AIRuntimeSettings,
    slot_start: datetime,
    draft: CalendarBookingDraft,
) -> bool:
    duration_minutes = int(runtime.google_slot_minutes or draft.duration_minutes or 30)
    slot_end = slot_start + timedelta(minutes=duration_minutes)
    tz_name = _calendar_tz_name(runtime, draft)
    try:
        sa = json.loads(runtime.google_service_account_json)
        token = _google_token(runtime, for_events=False)
        busy = freebusy_query(
            access_token=token,
            calendar_id=runtime.google_calendar_id,
            time_min=slot_start,
            time_max=slot_end,
            timezone=tz_name,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed freeBusy check for preferred slot")
        return False
    return not slot_overlaps_busy(slot_start, slot_end, busy)


def _parse_preferred_datetime(text: str, *, tz_name: str) -> datetime | None:
    """Parse common Spanish date/time phrases into a timezone-aware datetime."""
    low = (text or "").lower().strip()
    if not low:
        return None

    zone = _tz(tz_name)
    now = _now_in_calendar_tz(tz_name)

    # Normalize am/pm variants
    low = (
        low.replace("a.m.", "am")
        .replace("p.m.", "pm")
        .replace("a.m", "am")
        .replace("p.m", "pm")
    )

    date_match = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", low)
    time_match = re.search(
        r"(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b",
        low,
        flags=re.I,
    )
    if not time_match:
        time_match = re.search(r"(?:a\s+las?\s+)?(\d{1,2}):(\d{2})\b", low)
    if not time_match:
        time_match = re.search(r"a\s+las?\s+(\d{1,2})\b", low)

    has_relative_day = bool(re.search(r"\b(hoy|mañana|manana)\b", low))
    has_weekday = any(d in low for d in _WEEKDAYS_ES)
    if not date_match and not has_weekday and not has_relative_day:
        return None

    hour = None
    minute = 0
    if time_match:
        hour = int(time_match.group(1))
        minute = int(time_match.group(2) or 0) if time_match.lastindex and time_match.lastindex >= 2 else 0
        meridiem = ""
        if time_match.lastindex and time_match.lastindex >= 3 and time_match.group(3):
            meridiem = time_match.group(3).lower()
        if meridiem == "pm" and hour < 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
        if hour > 23 or minute > 59:
            return None

    year = now.year
    month = None
    day = None
    if date_match:
        day = int(date_match.group(1))
        month = int(date_match.group(2))
        if date_match.group(3):
            year = int(date_match.group(3))
            if year < 100:
                year += 2000
    elif re.search(r"\bhoy\b", low):
        day, month, year = now.day, now.month, now.year
    elif re.search(r"\b(mañana|manana)\b", low):
        tomorrow = now + timedelta(days=1)
        day, month, year = tomorrow.day, tomorrow.month, tomorrow.year
    else:
        for idx, name in enumerate(_WEEKDAYS_ES):
            if name in low:
                target = _resolve_weekday_date(idx, now=now)
                day, month, year = target.day, target.month, target.year
                break

    if day is None or month is None or hour is None:
        return None

    try:
        candidate = datetime(year, month, day, hour, minute, tzinfo=zone)
    except ValueError:
        return None

    # If date without year already passed, roll to next year
    if candidate < now - timedelta(hours=1) and not (date_match and date_match.group(3)):
        try:
            candidate = candidate.replace(year=year + 1)
        except ValueError:
            return None
    return candidate


def _pick_slot_from_text(
    *,
    user_text: str,
    offered_slots: list[str],
    model: str,
    tz_name: str = "America/Bogota",
) -> str | None:
    if not offered_slots:
        return None
    # quick deterministic path
    for slot in offered_slots:
        dt = datetime.fromisoformat(slot)
        local = _as_calendar_local(dt, tz_name)
        marker = local.strftime("%d/%m %H:%M")
        if marker in user_text:
            return slot
        # "viernes ... 09:00" / "9:00"
        label = _format_slot_label(dt, tz_name).lower()
        low = user_text.lower()
        if local.strftime("%H:%M") in low and local.strftime("%d/%m") in low:
            return slot
        if label in low:
            return slot

    preferred = _parse_preferred_datetime(user_text, tz_name=tz_name)
    if preferred:
        matched = _match_offered_slot(preferred, offered_slots, tz_name=tz_name)
        if matched:
            return matched

    api_key = resolve_openai_api_key()
    if not api_key:
        return None
    client = OpenAI(api_key=api_key)
    slots_human = [
        {
            "iso": s,
            "label": _format_slot_label(datetime.fromisoformat(s), tz_name),
        }
        for s in offered_slots
    ]
    prompt = (
        "Selecciona el slot más probable mencionado por el usuario. "
        "Devuelve SOLO JSON con {'slot_iso': <iso o null>}. "
        "Si el usuario pide un día/hora que NO está en las opciones, slot_iso debe ser null.\n"
        f"Opciones: {json.dumps(slots_human, ensure_ascii=False)}\n"
        f"Mensaje usuario: {user_text}"
    )
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": "Responde solo JSON válido."}, {"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=80,
    )
    raw = (resp.choices[0].message.content or "").strip()
    m = re.search(r"\{.*\}", raw, flags=re.S)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    candidate = parsed.get("slot_iso")
    if candidate in offered_slots:
        return candidate
    return None

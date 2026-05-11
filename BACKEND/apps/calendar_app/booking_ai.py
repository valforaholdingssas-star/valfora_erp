"""Conversation booking orchestration using Google Calendar availability."""

from __future__ import annotations

import json
import re
from datetime import datetime
from datetime import timedelta

from django.utils import timezone
from openai import OpenAI

from apps.ai_config.models import AIRuntimeSettings, AIConfiguration
from apps.ai_config.runtime import resolve_openai_api_key
from apps.calendar_app.google_client import (
    compute_candidate_slots,
    create_event,
    freebusy_query,
    get_service_account_token,
)
from apps.calendar_app.models import CalendarBookingDraft
from apps.chat.models import Message

SCHEDULE_KEYWORDS = (
    "agendar",
    "agenda",
    "cita",
    "reunión",
    "reunion",
    "horario",
    "disponible",
    "disponibilidad",
)


def maybe_handle_calendar_booking(*, inbound: Message, config: AIConfiguration) -> Message | None:
    """Handle scheduling flow before standard AI response."""
    runtime = AIRuntimeSettings.objects.order_by("-updated_at").first()
    if not runtime or not runtime.google_calendar_enabled:
        return None
    if not runtime.google_calendar_id or not runtime.google_service_account_json:
        return None

    conv = inbound.conversation
    text = (inbound.content or "").strip()
    if not text:
        return None

    intent = _infer_calendar_intent(user_text=text, model=config.llm_model)
    draft = CalendarBookingDraft.objects.filter(conversation=conv).first()
    if draft and draft.status == "pending_selection":
        offered_slots = [str(x) for x in (draft.offered_slots or [])]
        chosen = intent.get("slot_iso") if intent.get("intent") == "book_slot" else None
        if not chosen:
            chosen = _pick_slot_from_text(
                user_text=text,
                offered_slots=offered_slots,
                model=config.llm_model,
            )
        if chosen and chosen in offered_slots:
            try:
                return _confirm_booking(
                    inbound=inbound,
                    runtime=runtime,
                    draft=draft,
                    slot_iso=chosen,
                )
            except Exception as exc:  # noqa: BLE001
                return Message.objects.create(
                    conversation=conv,
                    sender_type="ai_bot",
                    content=(
                        "Intenté reservar la cita pero hubo un error con el calendario. "
                        "¿Te comparto nuevos horarios?"
                    ),
                    message_type="text",
                    status="pending" if conv.channel == "whatsapp" else "sent",
                    is_ai_generated=True,
                    ai_context_used={"calendar_booking_error": str(exc)},
                )
        if intent.get("intent") == "book_slot":
            human_slots = "\n".join(
                f"- {timezone.localtime(datetime.fromisoformat(s)).strftime('%A %d/%m %H:%M')}" for s in offered_slots[:3]
            )
            return Message.objects.create(
                conversation=conv,
                sender_type="ai_bot",
                content=(
                    "Para reservar necesito que elijas uno de estos horarios exactos:\n"
                    f"{human_slots}\n\n"
                    "Puedes responder, por ejemplo: “el martes 14/05 a las 3:00 pm”."
                ),
                message_type="text",
                status="pending" if conv.channel == "whatsapp" else "sent",
                is_ai_generated=True,
                ai_context_used={"calendar_waiting_selection": True, "offered_slots": offered_slots[:3]},
            )

    should_check_availability = intent.get("intent") == "check_availability" or _has_schedule_intent(text)
    if not should_check_availability:
        return None

    try:
        sa = json.loads(runtime.google_service_account_json)
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

    token = get_service_account_token(sa)
    now_local = timezone.localtime()
    days = int(runtime.google_booking_window_days or 7)
    time_max = now_local + timedelta(days=max(1, days))
    busy = freebusy_query(
        access_token=token,
        calendar_id=runtime.google_calendar_id,
        time_min=now_local,
        time_max=time_max,
        timezone=runtime.google_calendar_timezone or "America/Bogota",
    )
    slots = compute_candidate_slots(
        now_local=now_local,
        busy_ranges=busy,
        days_ahead=max(1, days),
        slot_minutes=int(runtime.google_slot_minutes or 30),
        max_results=6,
    )
    if not slots:
        return Message.objects.create(
            conversation=conv,
            sender_type="ai_bot",
            content="No encontré espacios disponibles por ahora. ¿Quieres que revisemos otra semana?",
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
    draft.timezone = runtime.google_calendar_timezone or "America/Bogota"
    draft.duration_minutes = int(runtime.google_slot_minutes or 30)
    draft.save()

    choices = "\n".join(f"- {timezone.localtime(s).strftime('%A %d/%m %H:%M')}" for s in slots[:3])
    return Message.objects.create(
        conversation=conv,
        sender_type="ai_bot",
        content=(
            "Perfecto, te propongo estos horarios disponibles:\n"
            f"{choices}\n\n"
            "Dime cuál prefieres (día y hora) y te la reservo."
        ),
        message_type="text",
        status="pending" if conv.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={"calendar_slots": offered[:3]},
    )


def _confirm_booking(*, inbound: Message, runtime: AIRuntimeSettings, draft: CalendarBookingDraft, slot_iso: str) -> Message:
    slot_start = datetime.fromisoformat(slot_iso)
    if timezone.is_naive(slot_start):
        slot_start = timezone.make_aware(slot_start)
    duration = timedelta(minutes=int(runtime.google_slot_minutes or draft.duration_minutes or 30))
    slot_end = slot_start + duration

    contact = inbound.conversation.contact
    notes = [
        f"Contacto: {contact.first_name} {contact.last_name}".strip(),
        f"Email: {contact.email or 'N/D'}",
        f"Teléfono: {contact.phone_number or contact.whatsapp_number or 'N/D'}",
    ]
    summary = f"Cita con {contact.first_name} {contact.last_name}".strip()

    sa = json.loads(runtime.google_service_account_json)
    token = get_service_account_token(sa)
    event = create_event(
        access_token=token,
        calendar_id=runtime.google_calendar_id,
        summary=summary,
        description="\n".join(notes),
        start_dt=slot_start,
        end_dt=slot_end,
        timezone=runtime.google_calendar_timezone or draft.timezone or "America/Bogota",
        attendee_email=contact.email or None,
    )

    draft.status = "confirmed"
    draft.selected_slot = slot_start
    draft.google_event_id = str(event.get("id") or "")
    draft.metadata = {
        **(draft.metadata or {}),
        "google_event_html_link": event.get("htmlLink"),
    }
    draft.save(update_fields=["status", "selected_slot", "google_event_id", "metadata", "updated_at"])

    return Message.objects.create(
        conversation=inbound.conversation,
        sender_type="ai_bot",
        content=(
            f"Listo, tu cita quedó agendada para {timezone.localtime(slot_start).strftime('%A %d/%m a las %H:%M')}."
        ),
        message_type="text",
        status="pending" if inbound.conversation.channel == "whatsapp" else "sent",
        is_ai_generated=True,
        ai_context_used={"calendar_booking_confirmed": True, "google_event_id": draft.google_event_id},
    )


def _has_schedule_intent(text: str) -> bool:
    low = text.lower()
    return any(k in low for k in SCHEDULE_KEYWORDS)


def _pick_slot_from_text(*, user_text: str, offered_slots: list[str], model: str) -> str | None:
    if not offered_slots:
        return None
    # quick deterministic path
    for slot in offered_slots:
        dt = datetime.fromisoformat(slot)
        local = timezone.localtime(dt)
        marker = local.strftime("%d/%m %H:%M")
        if marker in user_text:
            return slot

    api_key = resolve_openai_api_key()
    if not api_key:
        return None
    client = OpenAI(api_key=api_key)
    slots_human = [
        {
            "iso": s,
            "label": timezone.localtime(datetime.fromisoformat(s)).strftime("%A %d/%m %H:%M"),
        }
        for s in offered_slots
    ]
    prompt = (
        "Selecciona el slot más probable mencionado por el usuario. "
        "Devuelve SOLO JSON con {'slot_iso': <iso o null>}.\n"
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


def _infer_calendar_intent(*, user_text: str, model: str) -> dict:
    """
    Structured intent extraction for scheduling.
    Returns:
      {"intent": "none"|"check_availability"|"book_slot", "slot_iso": str|None}
    """
    low = user_text.lower()
    if any(k in low for k in SCHEDULE_KEYWORDS):
        return {"intent": "check_availability", "slot_iso": None}

    api_key = resolve_openai_api_key()
    if not api_key:
        return {"intent": "none", "slot_iso": None}
    client = OpenAI(api_key=api_key)
    prompt = (
        "Clasifica intención para agendar.\n"
        "Responde SOLO JSON con este formato exacto: "
        '{"intent":"none|check_availability|book_slot","slot_iso":null}.\n'
        "Usa book_slot solo si el usuario está eligiendo/confirmando un horario.\n"
        f"Mensaje: {user_text}"
    )
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Devuelve únicamente JSON válido."},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=80,
        )
        raw = (resp.choices[0].message.content or "").strip()
        m = re.search(r"\{.*\}", raw, flags=re.S)
        if not m:
            return {"intent": "none", "slot_iso": None}
        parsed = json.loads(m.group(0))
        intent = parsed.get("intent")
        if intent not in {"none", "check_availability", "book_slot"}:
            intent = "none"
        slot_iso = parsed.get("slot_iso")
        return {"intent": intent, "slot_iso": slot_iso if isinstance(slot_iso, str) else None}
    except Exception:  # noqa: BLE001
        return {"intent": "none", "slot_iso": None}

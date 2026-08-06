"""NLU layer: translate free-form booking talk into structured platform params.

Regex/keywords are fallback only. The LLM interprets conversational Spanish and
emits parameters the booking state machine understands.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any

from openai import OpenAI

from apps.ai_config.runtime import resolve_openai_api_key

logger = logging.getLogger(__name__)

_WEEKDAYS = (
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
)

VALID_ACTIONS = {
    "none",
    "start_booking",
    "provide_day",
    "provide_period",
    "provide_datetime",
    "choose_slot",
    "defer_week",
    "provide_email",
    "cancel",
    "clarify",
}


def empty_interpretation() -> dict[str, Any]:
    return {
        "related": False,
        "action": "none",
        "weekday": None,
        "date_iso": None,
        "period": None,
        "time_hhmm": None,
        "week_offset_days": 0,
        "email": None,
        "slot_iso": None,
        "confidence": 0.0,
        "source": "empty",
    }


def interpret_booking_utterance(
    *,
    text: str,
    draft_status: str,
    tz_name: str,
    now_local: datetime,
    offered_slots: list[dict[str, str]] | None = None,
    draft_metadata: dict | None = None,
    model: str,
    recent_meeting_invite: bool = False,
    deterministic_hint: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Interpret user text into structured booking parameters.

    Prefer LLM translation; merge/fallback with deterministic_hint from parsers.
    """
    hint = deterministic_hint or {}
    llm = _llm_interpret(
        text=text,
        draft_status=draft_status,
        tz_name=tz_name,
        now_local=now_local,
        offered_slots=offered_slots or [],
        draft_metadata=draft_metadata or {},
        model=model,
        recent_meeting_invite=recent_meeting_invite,
    )
    if llm:
        merged = _merge_interpretations(llm, hint)
        merged["source"] = "llm+deterministic" if hint else "llm"
        return merged

    if hint:
        hint = {**empty_interpretation(), **hint}
        hint["source"] = "deterministic"
        return hint
    return empty_interpretation()


def _merge_interpretations(primary: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any]:
    out = {**empty_interpretation(), **primary}
    # Fill gaps from deterministic parsers (never overwrite a confident LLM field).
    for key in (
        "weekday",
        "date_iso",
        "period",
        "time_hhmm",
        "email",
        "slot_iso",
    ):
        if not out.get(key) and hint.get(key):
            out[key] = hint[key]
    if not out.get("week_offset_days") and hint.get("week_offset_days"):
        out["week_offset_days"] = hint["week_offset_days"]
    if hint.get("related") and not out.get("related"):
        # If parsers found scheduling signals, keep related=true
        out["related"] = True
    if out.get("action") in {None, "none", "clarify"} and hint.get("action") not in {None, "none"}:
        out["action"] = hint["action"]
    # Promote richer actions when both agree on signals
    if out.get("time_hhmm") and (out.get("date_iso") or out.get("weekday")) and out.get("action") in {
        "provide_day",
        "none",
        "clarify",
        "provide_period",
        "start_booking",
    }:
        out["action"] = "provide_datetime"
        out["related"] = True
    elif (out.get("weekday") or out.get("date_iso")) and out.get("period") and out.get("action") in {
        "none",
        "clarify",
        "start_booking",
        "provide_period",
    }:
        # "martes en la tarde" must not stay as start_booking
        out["action"] = "provide_day"
        out["related"] = True
    elif out.get("period") and out.get("action") in {"none", "clarify", "start_booking"}:
        out["action"] = "provide_period"
        out["related"] = True
    elif (out.get("weekday") or out.get("date_iso")) and out.get("action") in {
        "none",
        "clarify",
        "start_booking",
    }:
        out["action"] = "provide_day"
        out["related"] = True
    if out.get("action") not in VALID_ACTIONS:
        out["action"] = "none"
    if out.get("period") not in {None, "morning", "afternoon"}:
        out["period"] = None
    if out.get("weekday") and out["weekday"] not in _WEEKDAYS:
        # normalize accents
        norm = (
            str(out["weekday"])
            .lower()
            .replace("miercoles", "miércoles")
            .replace("sabado", "sábado")
        )
        out["weekday"] = norm if norm in _WEEKDAYS else None
    # Prefer deterministic weekday/date when LLM echoes a stale draft day
    if hint.get("weekday") and out.get("weekday") and hint.get("weekday") != out.get("weekday"):
        # If parsers found an explicit weekday in the utterance, trust it
        out["weekday"] = hint["weekday"]
        if hint.get("date_iso"):
            out["date_iso"] = hint["date_iso"]
        if out.get("action") in {"provide_period", "clarify", "none", "start_booking", "choose_slot"}:
            out["action"] = "provide_day"
            out["related"] = True
            out["period"] = hint.get("period")  # only if parsers saw it in same text
    if hint.get("date_iso") and not out.get("date_iso"):
        out["date_iso"] = hint["date_iso"]
    # Changing day without saying mañana/tarde: drop echoed draft period
    if (
        out.get("action") == "provide_day"
        and (hint.get("weekday") or hint.get("date_iso"))
        and not hint.get("period")
    ):
        out["period"] = None
    # pending_period answers: prefer provide_period over mañana→tomorrow day
    if hint.get("action") == "provide_period" and hint.get("period"):
        out["action"] = "provide_period"
        out["period"] = hint["period"]
        out["related"] = True
        if not hint.get("weekday") and not hint.get("date_iso"):
            out["weekday"] = None
            out["date_iso"] = None
    try:
        out["confidence"] = float(out.get("confidence") or 0.0)
    except (TypeError, ValueError):
        out["confidence"] = 0.0
    try:
        out["week_offset_days"] = int(out.get("week_offset_days") or 0)
    except (TypeError, ValueError):
        out["week_offset_days"] = 0
    out["related"] = bool(out.get("related"))
    return out


def _llm_interpret(
    *,
    text: str,
    draft_status: str,
    tz_name: str,
    now_local: datetime,
    offered_slots: list[dict[str, str]],
    draft_metadata: dict,
    model: str,
    recent_meeting_invite: bool,
) -> dict[str, Any] | None:
    api_key = resolve_openai_api_key()
    if not api_key:
        return None

    today = now_local.strftime("%Y-%m-%d")
    weekday_today = _WEEKDAYS[now_local.weekday()]
    slots_json = json.dumps(offered_slots[:6], ensure_ascii=False)
    meta_json = json.dumps(
        {
            "preferred_day": draft_metadata.get("preferred_day"),
            "preferred_period": draft_metadata.get("preferred_period"),
            "week_offset_days": draft_metadata.get("week_offset_days") or 0,
        },
        ensure_ascii=False,
    )
    system = (
        "Eres un intérprete NLU para un sistema de agenda. "
        "Traduces el mensaje del cliente a JSON de parámetros para la plataforma. "
        "NO inventes horarios disponibles. NO respondas al cliente: solo JSON.\n"
        "Reglas de fecha: si hoy es jueves y dice viernes → este viernes; "
        "si dice martes → el próximo martes (siguiente ocurrencia futura). "
        "Si pide 'otra/próxima/siguiente semana' → week_offset_days=7.\n"
        "period: morning=mañana laboral, afternoon=tarde laboral.\n"
        "related=false para saludos/ruido ('hola', '?', 'qué hablas', 'puedes?') "
        "y para mensajes que NO hablan de agendar/reunión/día/hora/correo "
        "(ej: 'quiero más información').\n"
        "NUNCA copies preferred_period/preferred_day del draft_metadata si el cliente "
        "no los mencionó en ESTE mensaje. Si cambia de día ('mejor el jueves', "
        "'no puedo el miércoles, el jueves', 'espera mejor reunámonos el domingo') "
        "→ action=provide_day con el NUEVO weekday y period=null "
        "salvo que diga mañana/tarde explícitamente. "
        "Si draft_status=pending_period y el cliente dice solo 'mañana'/'tarde'/"
        "'en la mañana' → action=provide_period (period=morning|afternoon). "
        "NUNCA interpretes 'mañana' como el día siguiente cuando draft_status=pending_period.\n"
        "Si hay invitación reciente a reunirse y el cliente afirma (dale/ok/sí) → action=start_booking, related=true.\n"
        "Acciones válidas: none, start_booking, provide_day, provide_period, provide_datetime, "
        "choose_slot, defer_week, provide_email, cancel, clarify."
    )
    user = (
        f"timezone={tz_name}\n"
        f"hoy={today} ({weekday_today})\n"
        f"draft_status={draft_status}\n"
        f"recent_meeting_invite={recent_meeting_invite}\n"
        f"draft_metadata={meta_json}\n"
        f"offered_slots={slots_json}\n"
        f"mensaje_cliente={text}\n\n"
        "Devuelve SOLO JSON con exactamente estas claves:\n"
        "{"
        '"related":true|false,'
        '"action":"none|start_booking|provide_day|provide_period|provide_datetime|choose_slot|defer_week|provide_email|cancel|clarify",'
        '"weekday":"lunes|martes|miércoles|jueves|viernes|sábado|domingo"|null,'
        '"date_iso":"YYYY-MM-DD"|null,'
        '"period":"morning|afternoon"|null,'
        '"time_hhmm":"HH:MM"|null,'
        '"week_offset_days":0,'
        '"email":null,'
        '"slot_iso":null,'
        '"confidence":0.0'
        "}"
    )
    try:
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
            max_tokens=220,
        )
        raw = (resp.choices[0].message.content or "").strip()
        match = re.search(r"\{.*\}", raw, flags=re.S)
        if not match:
            return None
        parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict):
            return None
        return parsed
    except Exception:  # noqa: BLE001
        logger.exception("Booking NLU interpretation failed")
        return None

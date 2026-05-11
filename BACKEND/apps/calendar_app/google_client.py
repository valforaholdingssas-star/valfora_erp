"""Google Calendar low-level client using service account JWT flow."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

GOOGLE_CAL_SCOPE = "https://www.googleapis.com/auth/calendar"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _sign_rs256(payload: bytes, private_key_pem: str) -> bytes:
    key = serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    return key.sign(payload, padding.PKCS1v15(), hashes.SHA256())


def build_service_account_jwt(sa_info: dict[str, Any], scope: str = GOOGLE_CAL_SCOPE) -> str:
    now = int(datetime.now(tz=UTC).timestamp())
    header = {"alg": "RS256", "typ": "JWT"}
    claim_set = {
        "iss": sa_info["client_email"],
        "scope": scope,
        "aud": sa_info.get("token_uri", "https://oauth2.googleapis.com/token"),
        "exp": now + 3600,
        "iat": now,
    }
    encoded_header = _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_claims = _b64url(json.dumps(claim_set, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_claims}".encode("utf-8")
    signature = _sign_rs256(signing_input, sa_info["private_key"])
    return f"{encoded_header}.{encoded_claims}.{_b64url(signature)}"


def get_service_account_token(sa_info: dict[str, Any], scope: str = GOOGLE_CAL_SCOPE) -> str:
    assertion = build_service_account_jwt(sa_info, scope=scope)
    token_uri = sa_info.get("token_uri", "https://oauth2.googleapis.com/token")
    response = requests.post(
        token_uri,
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        },
        timeout=30,
    )
    response.raise_for_status()
    body = response.json()
    token = (body.get("access_token") or "").strip()
    if not token:
        raise RuntimeError("Google token response missing access_token")
    return token


def freebusy_query(
    *,
    access_token: str,
    calendar_id: str,
    time_min: datetime,
    time_max: datetime,
    timezone: str,
) -> list[tuple[datetime, datetime]]:
    url = "https://www.googleapis.com/calendar/v3/freeBusy"
    payload = {
        "timeMin": time_min.isoformat(),
        "timeMax": time_max.isoformat(),
        "timeZone": timezone,
        "items": [{"id": calendar_id}],
    }
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    response.raise_for_status()
    body = response.json()
    busy = (
        body.get("calendars", {})
        .get(calendar_id, {})
        .get("busy", [])
    )
    out: list[tuple[datetime, datetime]] = []
    for it in busy:
        start = datetime.fromisoformat(str(it["start"]).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(it["end"]).replace("Z", "+00:00"))
        out.append((start, end))
    return out


def create_event(
    *,
    access_token: str,
    calendar_id: str,
    summary: str,
    description: str,
    start_dt: datetime,
    end_dt: datetime,
    timezone: str,
    attendee_email: str | None = None,
) -> dict[str, Any]:
    cal_id = quote(calendar_id, safe="@")
    url = f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events"
    payload: dict[str, Any] = {
        "summary": summary[:255],
        "description": description[:8000],
        "start": {"dateTime": start_dt.isoformat(), "timeZone": timezone},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": timezone},
    }
    if attendee_email:
        payload["attendees"] = [{"email": attendee_email}]
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def compute_candidate_slots(
    *,
    now_local: datetime,
    busy_ranges: list[tuple[datetime, datetime]],
    days_ahead: int,
    slot_minutes: int,
    workday_start_hour: int = 9,
    workday_end_hour: int = 18,
    max_results: int = 6,
) -> list[datetime]:
    """Return candidate slot starts (timezone-aware) avoiding busy intervals."""
    slot_delta = timedelta(minutes=max(15, slot_minutes))
    start_floor = now_local + timedelta(hours=2)
    out: list[datetime] = []
    day_cursor = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    for _ in range(max(1, days_ahead)):
        day_start = day_cursor.replace(hour=workday_start_hour, minute=0)
        day_end = day_cursor.replace(hour=workday_end_hour, minute=0)
        slot = day_start
        while slot + slot_delta <= day_end:
            if slot >= start_floor and not _overlaps(slot, slot + slot_delta, busy_ranges):
                out.append(slot)
                if len(out) >= max_results:
                    return out
            slot += slot_delta
        day_cursor = day_cursor + timedelta(days=1)
    return out


def _overlaps(start: datetime, end: datetime, busy: list[tuple[datetime, datetime]]) -> bool:
    for b_start, b_end in busy:
        if start < b_end and end > b_start:
            return True
    return False

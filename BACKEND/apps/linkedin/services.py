"""Service layer for Unipile API integration."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import requests
from django.core.cache import cache
from rest_framework.exceptions import APIException

from apps.ai_config.runtime import (
    resolve_linkedin_max_invitations_per_day,
    resolve_linkedin_max_messages_per_day,
    resolve_linkedin_max_search_results_per_day,
    resolve_unipile_api_base_url,
    resolve_unipile_api_key,
)
from apps.linkedin.constants import ERROR_LINKEDIN_RATE_LIMITED, ERROR_UNIPILE_UNAVAILABLE

logger = logging.getLogger(__name__)


class LinkedInRateLimited(APIException):
    """Raised when internal quota for LinkedIn operations is exceeded."""

    status_code = 429
    default_detail = "Se alcanzó el límite diario de operación LinkedIn."
    default_code = ERROR_LINKEDIN_RATE_LIMITED


class UnipileUnavailable(APIException):
    """Raised when Unipile API is unavailable."""

    status_code = 503
    default_detail = "Unipile no está disponible en este momento."
    default_code = ERROR_UNIPILE_UNAVAILABLE


@dataclass(frozen=True)
class DailyQuota:
    """Daily limits for LinkedIn operations."""

    invitations: int
    searches: int
    messages: int


def _utc_day_key() -> str:
    return datetime.now(tz=UTC).date().isoformat()


def _cache_key(kind: str, account_id: str) -> str:
    return f"linkedin:{kind}:{account_id}:{_utc_day_key()}"


class LinkedInLimiter:
    """Simple per-account, per-day counters backed by Django cache/Redis."""

    def __init__(self) -> None:
        self.quota = DailyQuota(
            invitations=int(resolve_linkedin_max_invitations_per_day()),
            searches=int(resolve_linkedin_max_search_results_per_day()),
            messages=int(resolve_linkedin_max_messages_per_day()),
        )
        self.ttl = 60 * 60 * 30  # keep key long enough across UTC midnight boundaries

    def _increment_or_fail(self, kind: str, account_id: str, limit: int, amount: int = 1) -> None:
        key = _cache_key(kind, account_id)
        current = cache.get(key, 0)
        if current + amount > limit:
            raise LinkedInRateLimited(f"Límite excedido para {kind}. Intentaste {current + amount}/{limit}.")
        cache.set(key, current + amount, timeout=self.ttl)

    def consume_invitation(self, account_id: str) -> None:
        self._increment_or_fail("invitations", account_id, self.quota.invitations)

    def consume_search_results(self, account_id: str, amount: int) -> None:
        self._increment_or_fail("searches", account_id, self.quota.searches, amount=max(amount, 1))

    def consume_message(self, account_id: str) -> None:
        self._increment_or_fail("messages", account_id, self.quota.messages)


class UnipileService:
    """Wrapper for Unipile API v1 with consistent error handling."""

    timeout_seconds = 15

    def __init__(self):
        self.base_url = str(resolve_unipile_api_base_url()).rstrip("/")
        self.api_key = str(resolve_unipile_api_key()).strip()
        self.headers = {
            "X-API-KEY": self.api_key,
            "accept": "application/json",
            "content-type": "application/json",
        }
        self.limiter = LinkedInLimiter()

    def _request(self, method: str, endpoint: str, **kwargs) -> dict[str, Any]:
        if not self.base_url or not self.api_key:
            raise UnipileUnavailable("Unipile no está configurado en entorno.")
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        try:
            response = requests.request(
                method,
                url,
                headers=self.headers,
                timeout=self.timeout_seconds,
                **kwargs,
            )
            if response.status_code == 429:
                raise LinkedInRateLimited("Límite externo de Unipile/LinkedIn alcanzado.")
            response.raise_for_status()
            if not response.content:
                return {}
            return response.json()
        except LinkedInRateLimited:
            raise
        except requests.exceptions.RequestException as exc:
            logger.error("Unipile API error method=%s endpoint=%s error=%s", method, endpoint, exc)
            raise UnipileUnavailable() from exc

    def _request_soft(self, method: str, endpoint: str, **kwargs) -> dict[str, Any]:
        """
        Best-effort request wrapper.

        Returns empty payload if provider endpoint is unavailable/unsupported so
        caller can keep local flow healthy.
        """
        try:
            return self._request(method, endpoint, **kwargs)
        except (UnipileUnavailable, LinkedInRateLimited):
            logger.warning("Unipile soft request failed method=%s endpoint=%s", method, endpoint)
            return {}

    def get_auth_link(self, user_id: str, callback_url: str) -> dict[str, Any]:
        payload = {"name": f"valfora-{user_id}", "provider": "LINKEDIN", "success_redirect_url": callback_url}
        return self._request("POST", "/hosted/accounts/link", json=payload)

    def get_account(self, account_id: str) -> dict[str, Any]:
        return self._request("GET", f"/accounts/{account_id}")

    def disconnect_account(self, account_id: str) -> dict[str, Any]:
        return self._request("DELETE", f"/accounts/{account_id}")

    def search_people(self, account_id: str, keywords: str, filters: dict[str, Any] | None = None, limit: int = 25) -> dict[str, Any]:
        payload = {"account_id": account_id, "keywords": keywords, "limit": limit, **(filters or {})}
        data = self._request("POST", "/linkedin/search", json=payload)
        self.limiter.consume_search_results(account_id, len(data.get("items", [])))
        return data

    def get_profile(self, account_id: str, profile_id: str) -> dict[str, Any]:
        return self._request("GET", f"/linkedin/profile/{profile_id}?account_id={account_id}")

    def send_invitation(self, account_id: str, profile_id: str, message: str | None = None) -> dict[str, Any]:
        self.limiter.consume_invitation(account_id)
        payload = {"account_id": account_id, "profile_id": profile_id, "message": message or ""}
        return self._request("POST", "/linkedin/invitations", json=payload)

    def get_sent_invitations(self, account_id: str) -> dict[str, Any]:
        return self._request("GET", f"/linkedin/invitations?account_id={account_id}")

    def withdraw_invitation(self, account_id: str, invitation_id: str) -> dict[str, Any]:
        return self._request("DELETE", f"/linkedin/invitations/{invitation_id}?account_id={account_id}")

    def list_chats(self, account_id: str, limit: int = 50) -> dict[str, Any]:
        return self._request("GET", f"/chats?account_id={account_id}&limit={limit}")

    def get_chat_messages(self, chat_id: str, limit: int = 100) -> dict[str, Any]:
        return self._request("GET", f"/chats/{chat_id}/messages?limit={limit}")

    def send_message(self, account_id: str, chat_id: str, text: str) -> dict[str, Any]:
        self.limiter.consume_message(account_id)
        payload = {"account_id": account_id, "chat_id": chat_id, "text": text}
        return self._request("POST", "/chats/messages", json=payload)

    def start_chat(self, account_id: str, recipient_id: str, text: str) -> dict[str, Any]:
        self.limiter.consume_message(account_id)
        payload = {"account_id": account_id, "recipient_id": recipient_id, "text": text}
        return self._request("POST", "/chats/start", json=payload)

    def mark_chat_read(self, account_id: str, chat_id: str) -> dict[str, Any]:
        """
        Mark provider chat as read (best effort).

        Unipile endpoint variants may differ by account type/version. Try both
        known forms without breaking caller behavior.
        """
        if not account_id or not chat_id:
            return {}
        payload = {"account_id": account_id, "chat_id": chat_id}
        response = self._request_soft("POST", "/chats/read", json=payload)
        if response:
            return response
        return self._request_soft("POST", f"/chats/{chat_id}/read?account_id={account_id}")

    def register_webhook(self, request_url: str, source: str = "messaging") -> dict[str, Any]:
        payload = {"request_url": request_url, "source": source}
        return self._request("POST", "/webhooks", json=payload)

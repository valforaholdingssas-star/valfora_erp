"""Celery tasks for LinkedIn module."""

from __future__ import annotations

import random
import time
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.linkedin.models import LinkedInAccount, LinkedInProspect, LinkedInWebhookEvent, ProspectStageLog, SavedSearch
from apps.linkedin.services import UnipileService
from apps.notifications.models import Notification
from apps.notifications.services import notify_inbound_linkedin_message


def _frequency_delta(frequency: str) -> timedelta:
    if frequency == "daily":
        return timedelta(days=1)
    if frequency == "every_2_days":
        return timedelta(days=2)
    if frequency == "weekly":
        return timedelta(days=7)
    return timedelta(days=1)


def _jitter_minutes_for_search(search: SavedSearch) -> int:
    # Stable jitter per-search in range [-30, +30] minutes.
    return (hash(str(search.id)) % 61) - 30


def _next_execution_at(search: SavedSearch):
    base_time = search.last_executed_at or search.created_at
    return base_time + _frequency_delta(search.frequency) + timedelta(minutes=_jitter_minutes_for_search(search))


@shared_task
def handle_new_message(webhook_event_id: str) -> None:
    """Handle inbound message webhook event."""
    event = LinkedInWebhookEvent.objects.filter(id=webhook_event_id).first()
    if not event:
        return
    payload = event.payload or {}
    account = LinkedInAccount.objects.filter(unipile_account_id=payload.get("account_id"), is_active=True).first()
    if not account:
        event.status = "ignored"
        event.processed_at = timezone.now()
        event.save(update_fields=["status", "processed_at", "updated_at"])
        return
    sender = (payload.get("sender") or {}).get("attendee_provider_id") or payload.get("profile_id")
    message_text = str(payload.get("text") or payload.get("body") or payload.get("content") or "")
    prospect = LinkedInProspect.objects.filter(account=account, linkedin_profile_id=str(sender), is_active=True).first()
    if prospect:
        prospect.last_message_at = timezone.now()
        prospect.last_message_direction = "inbound"
        if not prospect.unipile_chat_id:
            prospect.unipile_chat_id = str(payload.get("chat_id") or "")
        if prospect.funnel_stage in {"contacted", "no_response"}:
            ProspectStageLog.objects.create(
                prospect=prospect,
                from_stage=prospect.funnel_stage,
                to_stage="high_interest",
                changed_by=None,
                reason="Transición automática por webhook message_received",
            )
            prospect.funnel_stage = "high_interest"
        prospect.save(update_fields=["last_message_at", "last_message_direction", "unipile_chat_id", "funnel_stage", "updated_at"])
        notify_inbound_linkedin_message(prospect=prospect, message_text=message_text)
    event.status = "processed"
    event.processed_at = timezone.now()
    event.save(update_fields=["status", "processed_at", "updated_at"])


@shared_task
def handle_new_relation(webhook_event_id: str) -> None:
    """Handle invitation accepted / new relation webhook event."""
    event = LinkedInWebhookEvent.objects.filter(id=webhook_event_id).first()
    if not event:
        return
    payload = event.payload or {}
    account = LinkedInAccount.objects.filter(unipile_account_id=payload.get("account_id"), is_active=True).first()
    if not account:
        event.status = "ignored"
        event.processed_at = timezone.now()
        event.save(update_fields=["status", "processed_at", "updated_at"])
        return
    profile_id = str(payload.get("profile_id") or (payload.get("relation") or {}).get("provider_id") or "")
    prospect = LinkedInProspect.objects.filter(
        account=account,
        linkedin_profile_id=profile_id,
        invitation_status="pending",
        is_active=True,
    ).first()
    if prospect:
        old = prospect.funnel_stage
        prospect.invitation_status = "accepted"
        prospect.invitation_accepted_at = timezone.now()
        prospect.network_distance = "first"
        prospect.funnel_stage = "high_interest"
        prospect.save(
            update_fields=[
                "invitation_status",
                "invitation_accepted_at",
                "network_distance",
                "funnel_stage",
                "updated_at",
            ]
        )
        ProspectStageLog.objects.create(
            prospect=prospect,
            from_stage=old,
            to_stage="high_interest",
            changed_by=None,
            reason="Transición automática por webhook new_relation",
        )
    event.status = "processed"
    event.processed_at = timezone.now()
    event.save(update_fields=["status", "processed_at", "updated_at"])


@shared_task
def handle_account_status(webhook_event_id: str) -> None:
    """Handle account status webhook event."""
    event = LinkedInWebhookEvent.objects.filter(id=webhook_event_id).first()
    if not event:
        return
    payload = event.payload or {}
    account = LinkedInAccount.objects.filter(unipile_account_id=payload.get("account_id")).first()
    if not account:
        event.status = "ignored"
        event.processed_at = timezone.now()
        event.save(update_fields=["status", "processed_at", "updated_at"])
        return
    evt = payload.get("event")
    if evt == "account_disconnected":
        account.status = "disconnected"
    elif evt == "account_credentials":
        account.status = "reconnecting"
    else:
        account.status = "active"
    account.last_sync_at = timezone.now()
    account.save(update_fields=["status", "last_sync_at", "updated_at"])
    event.status = "processed"
    event.processed_at = timezone.now()
    event.save(update_fields=["status", "processed_at", "updated_at"])


def _is_due(search: SavedSearch) -> bool:
    if not search.last_executed_at:
        return True
    return timezone.now() >= _next_execution_at(search)


def _extract_chat_unread_map(payload: dict) -> dict[str, bool]:
    """Normalize provider chat payload into chat_id -> unread bool."""
    items = payload.get("items") or payload.get("results") or payload.get("chats") or []
    result: dict[str, bool] = {}
    for row in items:
        if not isinstance(row, dict):
            continue
        chat_id = str(row.get("chat_id") or row.get("id") or row.get("uid") or "").strip()
        if not chat_id:
            continue
        unread_count = row.get("unread_count")
        unread_flag = row.get("unread")
        last_message_read = row.get("last_message_read")
        is_unread = False
        if isinstance(unread_count, int):
            is_unread = unread_count > 0
        elif isinstance(unread_flag, bool):
            is_unread = unread_flag
        elif isinstance(last_message_read, bool):
            is_unread = not last_message_read
        result[chat_id] = is_unread
    return result


@shared_task
def linkedin_execute_saved_searches() -> None:
    """Execute active saved searches periodically."""
    service = UnipileService()
    searches = SavedSearch.objects.filter(is_active=True, account__is_active=True).select_related("account")
    for search in searches:
        if not _is_due(search):
            continue
        filters = {
            "job_title": search.job_title,
            "industry": search.industry,
            "location": search.location,
            "network_distance": search.network_distance,
        }
        payload = service.search_people(
            search.account.unipile_account_id,
            keywords=search.keywords,
            filters={k: v for k, v in filters.items() if v},
            limit=25,
        )
        created = 0
        for item in payload.get("items", []):
            profile_id = str(item.get("profile_id") or item.get("id") or "").strip()
            if not profile_id:
                continue
            _, was_created = LinkedInProspect.objects.get_or_create(
                account=search.account,
                linkedin_profile_id=profile_id,
                defaults={
                    "saved_search": search,
                    "linkedin_profile_url": item.get("profile_url", ""),
                    "full_name": item.get("full_name") or item.get("name") or "Perfil LinkedIn",
                    "headline": item.get("headline", ""),
                    "company_name": item.get("company_name", ""),
                    "job_title": item.get("job_title", ""),
                    "location": item.get("location", ""),
                    "profile_picture_url": item.get("profile_picture_url", ""),
                    "network_distance": item.get("network_distance", "out_of_network"),
                },
            )
            if was_created:
                created += 1
        search.last_executed_at = timezone.now()
        search.total_results_found = max(search.total_results_found + created, search.total_results_found)
        search.save(update_fields=["last_executed_at", "total_results_found", "updated_at"])
        time.sleep(random.randint(2, 5))


@shared_task
def linkedin_sync_invitation_statuses() -> None:
    """Sync invitation statuses from provider for pending prospects."""
    service = UnipileService()
    accounts = LinkedInAccount.objects.filter(is_active=True, status="active")
    for account in accounts:
        payload = service.get_sent_invitations(account.unipile_account_id)
        statuses = {str(row.get("profile_id") or ""): str(row.get("status") or "").lower() for row in payload.get("items", [])}
        pending = LinkedInProspect.objects.filter(account=account, invitation_status="pending", is_active=True)
        for prospect in pending:
            provider_status = statuses.get(prospect.linkedin_profile_id)
            if not provider_status:
                continue
            if provider_status in {"accepted", "declined", "withdrawn"}:
                prospect.invitation_status = provider_status
                if provider_status == "accepted":
                    prospect.network_distance = "first"
                    if prospect.funnel_stage in {"contacted", "no_response"}:
                        prospect.funnel_stage = "high_interest"
                prospect.save(update_fields=["invitation_status", "network_distance", "funnel_stage", "updated_at"])


@shared_task
def linkedin_reconcile_read_states() -> None:
    """
    Reconcile LinkedIn unread states between provider and local notifications.

    - Provider unread + no local unread => create local unread notification.
    - Provider read + local unread => mark local notifications as read.
    """
    service = UnipileService()
    accounts = LinkedInAccount.objects.filter(is_active=True, status="active")
    for account in accounts:
        payload = service.list_chats(account.unipile_account_id, limit=200)
        unread_map = _extract_chat_unread_map(payload)
        if not unread_map:
            continue
        prospects = LinkedInProspect.objects.filter(
            account=account,
            is_active=True,
            unipile_chat_id__gt="",
        ).only("id", "full_name", "unipile_chat_id", "account_id")
        for prospect in prospects:
            provider_unread = unread_map.get(prospect.unipile_chat_id)
            if provider_unread is None:
                continue
            unread_qs = Notification.objects.filter(
                recipient=account.user,
                is_read=False,
                related_object_type="LinkedInProspect",
                related_object_id=prospect.id,
            )
            local_has_unread = unread_qs.exists()
            if provider_unread and not local_has_unread:
                notify_inbound_linkedin_message(
                    prospect=prospect,
                    message_text="Mensaje pendiente sincronizado desde LinkedIn.",
                )
            elif not provider_unread and local_has_unread:
                unread_qs.update(is_read=True, updated_at=timezone.now())

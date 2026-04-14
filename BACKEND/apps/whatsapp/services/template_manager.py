"""Template orchestration helpers."""

from __future__ import annotations

from django.utils import timezone

from apps.whatsapp.models import WhatsAppTemplate
from apps.whatsapp.services.whatsapp_api_service import WhatsAppAPIService


def sync_templates_for_phone(phone_number) -> int:  # noqa: ANN001
    service = WhatsAppAPIService(phone_number=phone_number)
    count = service.sync_templates()
    WhatsAppTemplate.objects.filter(account=phone_number.account).update(last_synced_at=timezone.now())
    return count

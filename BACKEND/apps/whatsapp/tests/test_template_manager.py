"""Tests for template orchestration helpers."""

import pytest
from django.utils import timezone

from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber, WhatsAppTemplate
from apps.whatsapp.services.template_manager import sync_templates_for_phone


@pytest.mark.django_db
def test_sync_templates_for_phone_updates_last_synced(monkeypatch):
    account = WhatsAppBusinessAccount.objects.create(
        name="Main",
        waba_id="waba-1",
        access_token="token-1",
        webhook_verify_token="verify-1",
        webhook_secret="secret-1",
    )
    phone = WhatsAppPhoneNumber.objects.create(
        account=account,
        phone_number_id="phone-1",
        display_phone_number="+57 300 123 0000",
        status="connected",
    )
    template = WhatsAppTemplate.objects.create(
        account=account,
        name="welcome_tpl",
        category="utility",
        language="es",
        status="pending",
        body_text="Hola {{1}}",
    )
    before = timezone.now()

    monkeypatch.setattr(
        "apps.whatsapp.services.template_manager.WhatsAppAPIService.sync_templates",
        lambda self: 2,
    )

    synced = sync_templates_for_phone(phone)

    template.refresh_from_db()
    assert synced == 2
    assert template.last_synced_at is not None
    assert template.last_synced_at >= before

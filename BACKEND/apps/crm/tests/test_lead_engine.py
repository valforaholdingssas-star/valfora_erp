"""Integration tests for CRM LeadEngine automation."""

from __future__ import annotations

import pytest

from apps.chat.models import Conversation, Message
from apps.crm.lead_engine import LeadEngine
from apps.crm.models import Activity, Contact, Deal, DealStageHistory, LeadEngineConfig
from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber


@pytest.fixture
def wa_phone(db):
    account = WhatsAppBusinessAccount.objects.create(
        name="Main",
        waba_id="waba-lead-1",
        access_token="token",
        webhook_verify_token="verify",
        webhook_secret="secret",
    )
    return WhatsAppPhoneNumber.objects.create(
        account=account,
        phone_number_id="pn-lead-1",
        display_phone_number="+57 300 111 2222",
        status="connected",
        is_default=True,
    )


@pytest.mark.django_db
def test_lead_engine_creates_contact_deal_conversation_activity_for_new_inbound(wa_phone, admin_user):
    cfg = LeadEngineConfig.objects.create(
        assignment_strategy="specific_user",
        assignment_specific_user=admin_user,
    )
    engine = LeadEngine(cfg)

    out = engine.process_inbound_whatsapp_message(
        phone_number="+57 300 444 5555",
        sender_name="Cliente Nuevo",
        message_content="Hola, quiero informacion",
        message_type="text",
        whatsapp_message_id="wamid-lead-1",
        whatsapp_phone_number=wa_phone,
        metadata={"origin": "test"},
    )

    assert out["is_new_contact"] is True
    assert out["is_new_deal"] is True
    assert Contact.objects.filter(whatsapp_number="573004445555").exists()
    deal = Deal.objects.get(contact=out["contact"])
    assert deal.stage in {"new_lead", "qualified", "qualification"}
    assert Conversation.objects.filter(contact=out["contact"], channel="whatsapp").exists()
    assert Message.objects.filter(whatsapp_message_id="wamid-lead-1").count() == 1
    assert Activity.objects.filter(contact=out["contact"], activity_type="whatsapp", is_completed=False).exists()
    assert DealStageHistory.objects.filter(deal=deal, trigger="lead_created").exists()


@pytest.mark.django_db
def test_lead_engine_is_idempotent_for_duplicate_whatsapp_message_id(wa_phone, admin_user):
    cfg = LeadEngineConfig.objects.create(
        assignment_strategy="specific_user",
        assignment_specific_user=admin_user,
    )
    engine = LeadEngine(cfg)

    first = engine.process_inbound_whatsapp_message(
        phone_number="+57 300 777 8888",
        sender_name="Cliente Doble",
        message_content="Hola",
        message_type="text",
        whatsapp_message_id="wamid-dup-1",
        whatsapp_phone_number=wa_phone,
        metadata={},
    )
    second = engine.process_inbound_whatsapp_message(
        phone_number="+57 300 777 8888",
        sender_name="Cliente Doble",
        message_content="Hola",
        message_type="text",
        whatsapp_message_id="wamid-dup-1",
        whatsapp_phone_number=wa_phone,
        metadata={},
    )

    assert Message.objects.filter(whatsapp_message_id="wamid-dup-1").count() == 1
    assert first["message"].id == second["message"].id

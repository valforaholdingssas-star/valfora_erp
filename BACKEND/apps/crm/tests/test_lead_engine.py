"""Integration tests for CRM LeadEngine automation."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.ai_config.models import AIRuntimeSettings
from apps.chat.models import Conversation, Message
from apps.crm.lead_engine import LeadEngine
from apps.crm.pipeline_automation import PipelineAutomationService
from apps.crm.tasks import advance_closed_whatsapp_conversations, generate_business_summary_for_deal
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


@pytest.mark.django_db
@patch("apps.chat.tasks.fetch_whatsapp_media_for_message.delay")
def test_lead_engine_enqueues_inbound_media_download(mock_media_delay, wa_phone, admin_user):
    cfg = LeadEngineConfig.objects.create(
        assignment_strategy="specific_user",
        assignment_specific_user=admin_user,
    )
    engine = LeadEngine(cfg)

    out = engine.process_inbound_whatsapp_message(
        phone_number="+57 300 111 0000",
        sender_name="Cliente Imagen",
        message_content="[Imagen]",
        message_type="image",
        whatsapp_message_id="wamid-image-1",
        whatsapp_phone_number=wa_phone,
        metadata={"type": "image", "image": {"id": "media-xyz"}},
    )

    assert out["message"].message_type == "image"
    mock_media_delay.assert_called_once_with(str(out["message"].id), "media-xyz")


@pytest.mark.django_db
def test_lead_engine_new_whatsapp_conversation_inherits_global_ai_mode(wa_phone, admin_user):
    AIRuntimeSettings.objects.update_or_create(
        singleton_key="default",
        defaults={"global_ai_mode_enabled": True},
    )
    cfg = LeadEngineConfig.objects.create(
        assignment_strategy="specific_user",
        assignment_specific_user=admin_user,
    )
    engine = LeadEngine(cfg)

    out = engine.process_inbound_whatsapp_message(
        phone_number="+57 300 222 3333",
        sender_name="Cliente IA Global",
        message_content="Hola, este es mi primer mensaje",
        message_type="text",
        whatsapp_message_id="wamid-global-ai-1",
        whatsapp_phone_number=wa_phone,
        metadata={},
    )

    conversation = out["conversation"]
    conversation.refresh_from_db()
    assert conversation.ai_mode_enabled is True


@pytest.mark.django_db
@patch("apps.crm.tasks.generate_business_summary_for_deal.delay")
def test_advance_closed_whatsapp_conversations_only_moves_real_whatsapp_origin_deals(mock_summary_delay, admin_user):
    now = timezone.now()

    contact_whatsapp = Contact.objects.create(
        first_name="Closed",
        last_name="WhatsApp",
        email="closedwa@example.com",
        whatsapp_number="573009990001",
        created_by=admin_user,
        source="whatsapp",
    )
    deal_whatsapp = Deal.objects.create(
        title="Closed WA Deal",
        contact=contact_whatsapp,
        source="whatsapp",
        stage="qualified",
        assigned_to=admin_user,
    )
    conv_whatsapp, _ = Conversation.objects.get_or_create(contact=contact_whatsapp, deal=deal_whatsapp, channel="whatsapp")
    conv_whatsapp.customer_service_window_expires = now - timedelta(hours=2)
    conv_whatsapp.last_inbound_message_at = now - timedelta(hours=3)
    conv_whatsapp.status = "active"
    conv_whatsapp.save(update_fields=["customer_service_window_expires", "last_inbound_message_at", "status", "updated_at"])

    contact_manual = Contact.objects.create(
        first_name="Closed",
        last_name="Manual",
        email="closedmanual@example.com",
        whatsapp_number="573009990002",
        created_by=admin_user,
        source="manual",
    )
    deal_manual = Deal.objects.create(
        title="Closed Manual Deal",
        contact=contact_manual,
        source="manual",
        stage="qualified",
        assigned_to=admin_user,
    )
    conv_manual, _ = Conversation.objects.get_or_create(contact=contact_manual, deal=deal_manual, channel="whatsapp")
    conv_manual.customer_service_window_expires = now - timedelta(hours=2)
    conv_manual.last_inbound_message_at = now - timedelta(hours=3)
    conv_manual.status = "active"
    conv_manual.save(update_fields=["customer_service_window_expires", "last_inbound_message_at", "status", "updated_at"])

    moved = advance_closed_whatsapp_conversations()

    target_stage = PipelineAutomationService.get_follow_up_stage_key()
    deal_whatsapp.refresh_from_db()
    deal_manual.refresh_from_db()
    conv_whatsapp.refresh_from_db()
    conv_manual.refresh_from_db()

    assert moved == 1
    assert deal_whatsapp.stage == target_stage
    assert deal_manual.stage == "qualified"
    assert conv_whatsapp.status == "archived"
    assert conv_manual.status == "active"
    assert DealStageHistory.objects.filter(deal=deal_whatsapp, trigger="chat_window_closed").exists()
    assert not DealStageHistory.objects.filter(deal=deal_manual, trigger="chat_window_closed").exists()
    mock_summary_delay.assert_called_once_with(str(deal_whatsapp.id))


@pytest.mark.django_db
@patch("apps.crm.tasks.generate_business_summary_for_deal.delay")
def test_advance_closed_whatsapp_conversations_requires_real_inbound_message(mock_summary_delay, admin_user):
    now = timezone.now()

    contact = Contact.objects.create(
        first_name="Silent",
        last_name="Window",
        email="silentwindow@example.com",
        whatsapp_number="573009990004",
        created_by=admin_user,
        source="whatsapp",
    )
    deal = Deal.objects.create(
        title="Silent Window Deal",
        contact=contact,
        source="whatsapp",
        stage="qualified",
        assigned_to=admin_user,
    )
    conversation, _ = Conversation.objects.get_or_create(contact=contact, deal=deal, channel="whatsapp")
    conversation.customer_service_window_expires = now - timedelta(hours=2)
    conversation.last_inbound_message_at = None
    conversation.status = "active"
    conversation.save(update_fields=["customer_service_window_expires", "last_inbound_message_at", "status", "updated_at"])

    moved = advance_closed_whatsapp_conversations()

    deal.refresh_from_db()
    conversation.refresh_from_db()

    assert moved == 0
    assert deal.stage == "qualified"
    assert conversation.status == "active"
    assert not DealStageHistory.objects.filter(deal=deal, trigger="chat_window_closed").exists()
    mock_summary_delay.assert_not_called()


@pytest.mark.django_db
def test_repair_invalid_closed_window_moves_reverts_whatsapp_deals_without_inbound(admin_user):
    now = timezone.now()
    target_stage = PipelineAutomationService.get_follow_up_stage_key()

    contact = Contact.objects.create(
        first_name="Repair",
        last_name="Silent",
        email="repairsilent@example.com",
        whatsapp_number="573009990005",
        created_by=admin_user,
        source="whatsapp",
    )
    deal = Deal.objects.create(
        title="Repair Silent Deal",
        contact=contact,
        source="whatsapp",
        stage="qualified",
        assigned_to=admin_user,
    )
    conversation, _ = Conversation.objects.get_or_create(contact=contact, deal=deal, channel="whatsapp")
    conversation.customer_service_window_expires = now - timedelta(hours=4)
    conversation.last_inbound_message_at = None
    conversation.status = "archived"
    conversation.closed_at = now - timedelta(hours=3)
    conversation.save(update_fields=["customer_service_window_expires", "last_inbound_message_at", "status", "closed_at", "updated_at"])

    move_result = PipelineAutomationService.move_stage(
        deal=deal,
        to_stage=target_stage,
        trigger="chat_window_closed",
        moved_by=None,
        notes="Movimiento erróneo de prueba por cierre automático.",
    )
    assert move_result.moved is True

    call_command("repair_invalid_closed_window_moves", "--apply")

    deal.refresh_from_db()
    conversation.refresh_from_db()
    latest_history = deal.stage_history.order_by("-created_at").first()

    assert deal.stage == "qualified"
    assert conversation.status == "active"
    assert conversation.closed_at is None
    assert latest_history is not None
    assert latest_history.trigger == "manual"
    assert latest_history.to_stage == "qualified"
    assert "no tiene inbound real" in latest_history.notes


@pytest.mark.django_db
@patch("apps.crm.tasks.generate_business_summary_for_deal.delay")
def test_repair_non_whatsapp_closed_window_moves_reverts_only_wrong_auto_move(mock_summary_delay, admin_user):
    now = timezone.now()
    target_stage = PipelineAutomationService.get_follow_up_stage_key()

    contact_manual = Contact.objects.create(
        first_name="Repair",
        last_name="Manual",
        email="repairmanual@example.com",
        whatsapp_number="573009990003",
        created_by=admin_user,
        source="manual",
    )
    deal_manual = Deal.objects.create(
        title="Repair Manual Deal",
        contact=contact_manual,
        source="manual",
        stage="qualified",
        assigned_to=admin_user,
    )
    conv_manual, _ = Conversation.objects.get_or_create(contact=contact_manual, deal=deal_manual, channel="whatsapp")
    conv_manual.customer_service_window_expires = now - timedelta(hours=3)
    conv_manual.status = "archived"
    conv_manual.closed_at = now - timedelta(hours=2)
    conv_manual.save(update_fields=["customer_service_window_expires", "status", "closed_at", "updated_at"])

    move_result = PipelineAutomationService.move_stage(
        deal=deal_manual,
        to_stage=target_stage,
        trigger="chat_window_closed",
        moved_by=None,
        notes="Movimiento erróneo de prueba.",
    )
    assert move_result.moved is True

    call_command("repair_non_whatsapp_closed_window_moves", "--apply")

    deal_manual.refresh_from_db()
    conv_manual.refresh_from_db()
    latest_history = deal_manual.stage_history.order_by("-created_at").first()

    assert deal_manual.stage == "qualified"
    assert conv_manual.status == "active"
    assert conv_manual.closed_at is None
    assert latest_history is not None
    assert latest_history.trigger == "manual"
    assert latest_history.to_stage == "qualified"
    assert "no era origen WhatsApp" in latest_history.notes


@pytest.mark.django_db
def test_generate_business_summary_for_deal_builds_structured_summary_without_dumping_raw_transcript(admin_user):
    contact = Contact.objects.create(
        first_name="Resumen",
        last_name="Lead",
        email="resumenlead@example.com",
        whatsapp_number="573001000111",
        created_by=admin_user,
        source="whatsapp",
    )
    deal = Deal.objects.create(
        title="Servicio ERP",
        contact=contact,
        source="whatsapp",
        stage="qualified",
        assigned_to=admin_user,
        currency="COP",
        value=2500000,
    )
    conv = Conversation.objects.create(
        contact=contact,
        deal=deal,
        channel="whatsapp",
        status="archived",
        is_active=True,
    )
    Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Necesito una propuesta para automatizar inventarios y facturación.",
        message_type="text",
        status="delivered",
    )
    Message.objects.create(
        conversation=conv,
        sender_type="user",
        sender_user=admin_user,
        content="Perfecto, el siguiente paso es revisar alcance y agendar una llamada.",
        message_type="text",
        status="sent",
    )

    assert generate_business_summary_for_deal(str(deal.id)) is True

    deal.refresh_from_db()
    assert "Resumen comercial" in deal.business_notes
    assert "Negocio: Servicio ERP" in deal.business_notes
    assert "Necesidad detectada:" in deal.business_notes
    assert "Siguiente paso sugerido:" in deal.business_notes
    assert "Contacto:" in deal.business_notes
    assert "Contacto: Necesito una propuesta" not in deal.business_notes

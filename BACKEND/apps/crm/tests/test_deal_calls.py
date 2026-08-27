"""Tests for deal call desk and WhatsApp-only business summary gate."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.crm.models import Contact, Deal, DealCall, PipelineStage
from apps.crm.pipeline_automation import PipelineAutomationService
from apps.crm.tasks import generate_business_summary_for_deal

User = get_user_model()


@pytest.fixture
def api_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.mark.django_db
def test_generate_business_summary_skips_non_whatsapp_deals(admin_user):
    contact = Contact.objects.create(
        first_name="Manual",
        last_name="Lead",
        email="manuallead@example.com",
        created_by=admin_user,
        source="manual",
    )
    deal = Deal.objects.create(
        title="Lead manual",
        contact=contact,
        source="manual",
        stage="qualified",
        assigned_to=admin_user,
    )
    assert generate_business_summary_for_deal(str(deal.id)) is False
    deal.refresh_from_db()
    assert deal.business_notes == ""


@pytest.mark.django_db
def test_move_to_call_stage_assigns_configured_user(admin_user, settings):
    juan = User.objects.create_user(
        email="juan.campuzano@example.com",
        password="Pass1234!",
        first_name="Juan",
        last_name="Campuzano",
        role="collaborator",
    )
    settings.CRM_CALL_STAGE_ASSIGNEE_EMAIL = "juan.campuzano@example.com"
    PipelineStage.objects.get_or_create(
        key="realizar_llamada",
        defaults={
            "name": "Realizar llamada",
            "position": 2,
            "is_closed_stage": True,
        },
    )
    contact = Contact.objects.create(
        first_name="Call",
        last_name="Lead",
        email="calllead@example.com",
        created_by=admin_user,
        source="whatsapp",
    )
    deal = Deal.objects.create(
        title="Lead WA",
        contact=contact,
        source="whatsapp",
        stage="contacted",
        assigned_to=admin_user,
    )
    result = PipelineAutomationService.move_stage(
        deal=deal,
        to_stage="realizar_llamada",
        trigger="manual",
        moved_by=admin_user,
    )
    assert result.moved is True
    deal.refresh_from_db()
    assert deal.assigned_to_id == juan.id


@pytest.mark.django_db
def test_can_move_from_call_stage_to_closed_lost(admin_user):
    PipelineStage.objects.update_or_create(
        key="realizar_llamada",
        defaults={"name": "Realizar llamada", "position": 2, "is_closed_stage": True, "is_active": True},
    )
    PipelineStage.objects.update_or_create(
        key="closed_lost",
        defaults={"name": "Perdido", "position": 11, "is_closed_stage": True, "is_lost_stage": True, "is_active": True},
    )
    PipelineStage.objects.update_or_create(
        key="unanswered",
        defaults={"name": "Sin respuesta", "position": 10, "is_closed_stage": False, "is_active": True},
    )
    assert PipelineAutomationService.can_move("realizar_llamada", "closed_lost") is True
    assert PipelineAutomationService.can_move("realizar_llamada", "unanswered") is True

    contact = Contact.objects.create(
        first_name="Close",
        last_name="FromCall",
        email="closefromcall@test.com",
        assigned_to=admin_user,
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="Lead a cerrar",
        contact=contact,
        stage="realizar_llamada",
        source="whatsapp",
        assigned_to=admin_user,
    )
    result = PipelineAutomationService.move_stage(
        deal=deal,
        to_stage="closed_lost",
        trigger="manual",
        moved_by=admin_user,
        notes="Cerrar desde escritorio de llamadas",
    )
    assert result.moved is True
    deal.refresh_from_db()
    assert deal.stage == "closed_lost"


@pytest.mark.django_db
def test_create_and_list_deal_calls(api_client, admin_user):
    contact = Contact.objects.create(
        first_name="Nota",
        last_name="Call",
        email="notacall@example.com",
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="Deal llamada",
        contact=contact,
        source="whatsapp",
        stage="realizar_llamada",
        assigned_to=admin_user,
    )
    create_resp = api_client.post(
        f"/api/v1/crm/deals/{deal.id}/calls/",
        {"notes": "Cliente pidió callback mañana"},
        format="json",
    )
    assert create_resp.status_code == 201
    assert DealCall.objects.filter(deal=deal, is_active=True).count() == 1

    list_resp = api_client.get(f"/api/v1/crm/deals/{deal.id}/calls/")
    assert list_resp.status_code == 200
    assert len(list_resp.data) == 1
    assert "callback" in list_resp.data[0]["notes"]

    calendar_resp = api_client.get("/api/v1/crm/deal-calls/calendar/")
    assert calendar_resp.status_code == 200
    assert calendar_resp.data["total"] >= 1

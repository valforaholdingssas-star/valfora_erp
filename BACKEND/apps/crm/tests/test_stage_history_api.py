"""Tests for manual deal stage movement and history endpoints."""

import pytest
from rest_framework.test import APIClient

from apps.crm.models import Contact, Deal


@pytest.mark.django_db
def test_move_stage_and_stage_history(admin_user):
    contact = Contact.objects.create(
        first_name="Etapa",
        last_name="Prueba",
        email="etapa@test.com",
        assigned_to=admin_user,
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="Deal etapas",
        contact=contact,
        stage="new_lead",
        source="manual",
        assigned_to=admin_user,
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)

    move = client.post(
        f"/api/v1/crm/deals/{deal.id}/move-stage/",
        {"to_stage": "contacted", "notes": "Primer avance"},
        format="json",
    )
    assert move.status_code == 200

    history = client.get(f"/api/v1/crm/deals/{deal.id}/stage-history/")
    assert history.status_code == 200
    body = history.json()["data"]
    assert len(body) >= 1
    assert body[0]["to_stage"] == "contacted"
    assert body[0]["trigger"] == "manual"


@pytest.mark.django_db
def test_manual_move_from_call_stage_to_custom_stage(admin_user):
    from apps.crm.models import PipelineStage

    PipelineStage.objects.update_or_create(
        key="realizar_llamada",
        defaults={"name": "Realizar llamada", "position": 2, "is_closed_stage": True, "is_active": True},
    )
    PipelineStage.objects.update_or_create(
        key="nueva_etapa_11",
        defaults={"name": "Nueva etapa 11", "position": 11, "is_closed_stage": False, "is_active": True},
    )
    contact = Contact.objects.create(
        first_name="Etapa",
        last_name="Custom",
        email="etapa-custom@test.com",
        assigned_to=admin_user,
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="Deal custom stage",
        contact=contact,
        stage="realizar_llamada",
        source="whatsapp",
        assigned_to=admin_user,
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    move = client.post(
        f"/api/v1/crm/deals/{deal.id}/move-stage/",
        {"to_stage": "nueva_etapa_11", "notes": "Cambio manual desde pipeline canvas"},
        format="json",
    )
    assert move.status_code == 200, move.content
    deal.refresh_from_db()
    assert deal.stage == "nueva_etapa_11"


def test_json_safe_serializes_decimal_and_uuid():
    from decimal import Decimal
    from uuid import uuid4

    from apps.common.audit import json_safe

    payload = json_safe({"value": Decimal("1500.50"), "id": uuid4(), "nested": {"n": Decimal("1")}})
    assert payload["value"] == "1500.50"
    assert payload["nested"]["n"] == "1"


@pytest.mark.django_db
def test_patch_deal_stage_with_value_does_not_500(admin_user):
    from apps.crm.models import DealStageHistory, PipelineStage

    PipelineStage.objects.update_or_create(
        key="unanswered",
        defaults={"name": "Sin respuesta", "position": 10, "is_closed_stage": False, "is_active": True},
    )
    contact = Contact.objects.create(
        first_name="Calls",
        last_name="Desk",
        email="calls-desk@test.com",
        assigned_to=admin_user,
        created_by=admin_user,
    )
    deal = Deal.objects.create(
        title="Lead llamadas",
        contact=contact,
        stage="realizar_llamada",
        source="whatsapp",
        value="2500000.00",
        assigned_to=admin_user,
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    patch = client.patch(
        f"/api/v1/crm/deals/{deal.id}/",
        {
            "title": deal.title,
            "stage": "unanswered",
            "value": "2500000.00",
            "probability": 10,
        },
        format="json",
    )
    assert patch.status_code == 200, patch.content
    deal.refresh_from_db()
    assert deal.stage == "unanswered"
    assert DealStageHistory.objects.filter(deal=deal, to_stage="unanswered", trigger="manual").exists()

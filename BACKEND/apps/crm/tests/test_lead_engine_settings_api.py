"""Tests for lead engine settings endpoints."""

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_lead_engine_settings_get_and_patch(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)

    res = client.get("/api/v1/settings/lead-engine/")
    assert res.status_code == 200

    upd = client.patch(
        "/api/v1/settings/lead-engine/",
        {"max_response_time_minutes": 45, "assignment_strategy": "specific_user", "assignment_specific_user": str(admin_user.id)},
        format="json",
    )
    assert upd.status_code == 200
    assert upd.json()["data"]["max_response_time_minutes"] == 45


@pytest.mark.django_db
def test_pipeline_automation_settings_get_and_patch(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)

    res = client.get("/api/v1/settings/pipeline-automation/")
    assert res.status_code == 200

    upd = client.patch(
        "/api/v1/settings/pipeline-automation/",
        {"stale_deal_days": 10, "auto_move_on_proposal": False},
        format="json",
    )
    assert upd.status_code == 200
    assert upd.json()["data"]["stale_deal_days"] == 10

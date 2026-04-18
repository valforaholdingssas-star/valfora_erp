"""Tests for activity log endpoint."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.common.models import AuditLog


@pytest.mark.django_db
def test_activity_logs_requires_auth():
    client = APIClient()
    r = client.get("/api/v1/activity-logs/")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_activity_logs_forbidden_for_collaborator(collaborator_user):
    client = APIClient()
    client.force_authenticate(user=collaborator_user)
    r = client.get("/api/v1/activity-logs/")
    assert r.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_activity_logs_list_and_filters(admin_user):
    AuditLog.objects.create(
        user=admin_user,
        action="create",
        model_name="Deal",
        changes={"field": "stage"},
    )
    AuditLog.objects.create(
        user=admin_user,
        action="update",
        model_name="Contact",
        changes={"field": "name"},
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.get("/api/v1/activity-logs/?action=create&page_size=50")
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    data = body.get("data", body)
    assert "results" in data
    assert data["count"] == 1
    assert data["results"][0]["action"] == "create"

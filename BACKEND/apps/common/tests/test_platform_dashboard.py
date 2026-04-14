"""Tests for platform dashboard endpoint."""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_platform_dashboard_requires_auth():
    client = APIClient()
    url = reverse("platform-dashboard")
    r = client.get(url)
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_platform_dashboard_ok(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    url = reverse("platform-dashboard")
    r = client.get(url)
    assert r.status_code == status.HTTP_200_OK
    body = r.json()
    assert body.get("status") == "success"
    data = body.get("data") or {}
    assert "contacts_total" in data
    assert "notifications_unread" in data

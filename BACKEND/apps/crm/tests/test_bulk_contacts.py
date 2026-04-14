"""Bulk contact actions (FASE 7)."""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.crm.models import Contact


@pytest.mark.django_db
def test_bulk_assign_admin(admin_user):
    c1 = Contact.objects.create(
        first_name="A",
        last_name="1",
        email="a1@example.com",
        assigned_to=None,
    )
    c2 = Contact.objects.create(
        first_name="B",
        last_name="2",
        email="b2@example.com",
        assigned_to=None,
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    url = reverse("crm-contact-bulk-assign")
    r = client.post(
        url,
        {"ids": [str(c1.id), str(c2.id)], "assigned_to": str(admin_user.id)},
        format="json",
    )
    assert r.status_code == status.HTTP_200_OK
    body = r.json()
    data = body.get("data", body)
    assert data.get("updated") == 2
    c1.refresh_from_db()
    assert c1.assigned_to_id == admin_user.id


@pytest.mark.django_db
def test_bulk_stage_admin(admin_user):
    c1 = Contact.objects.create(
        first_name="A",
        last_name="1",
        email="a1b@example.com",
        lifecycle_stage="new_lead",
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    url = reverse("crm-contact-bulk-stage")
    r = client.post(
        url,
        {"ids": [str(c1.id)], "lifecycle_stage": "qualified"},
        format="json",
    )
    assert r.status_code == status.HTTP_200_OK
    c1.refresh_from_db()
    assert c1.lifecycle_stage == "qualified"

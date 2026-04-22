"""API tests for CRM module."""

import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.crm.models import Company, Contact


def _body(response):
    response.render()
    return json.loads(response.content.decode())


@pytest.mark.django_db
def test_create_and_list_contacts(admin_user):
    """Admin can create and list contacts."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    company = Company.objects.create(name="Acme SA")
    payload = {
        "first_name": "Ana",
        "last_name": "García",
        "email": "ana@example.com",
        "company": str(company.id),
        "lifecycle_stage": "new_lead",
        "intent_level": "warm",
        "tags": ["vip"],
        "custom_fields": {},
    }
    create = client.post("/api/v1/crm/contacts/", payload, format="json")
    assert create.status_code == 201
    body = _body(create)
    assert body["data"]["email"] == "ana@example.com"

    listed = client.get("/api/v1/crm/contacts/")
    assert listed.status_code == 200
    list_body = _body(listed)
    assert list_body["data"]["count"] >= 1


@pytest.mark.django_db
def test_collaborator_cannot_delete_contact(collaborator_user, admin_user):
    """Collaborator cannot soft-delete contacts."""
    contact = Contact.objects.create(
        first_name="B",
        last_name="User",
        email="b@example.com",
        created_by=admin_user,
    )
    client = APIClient()
    client.force_authenticate(user=collaborator_user)
    response = client.delete(f"/api/v1/crm/contacts/{contact.id}/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_dashboard_returns_metrics(admin_user):
    """Dashboard endpoint returns aggregated structure."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get("/api/v1/crm/dashboard/")
    assert response.status_code == 200
    body = _body(response)
    assert "pipeline_by_stage" in body["data"]
    assert "recent_activities" in body["data"]


@pytest.mark.django_db
def test_timeline_for_contact(admin_user):
    """Timeline lists activities for a contact."""
    contact = Contact.objects.create(
        first_name="C",
        last_name="Time",
        email="time@example.com",
        created_by=admin_user,
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get(f"/api/v1/crm/contacts/{contact.id}/timeline/")
    assert response.status_code == 200
    body = _body(response)
    assert isinstance(body["data"], list)


@pytest.mark.django_db
def test_upload_document(admin_user):
    """Document upload stores file metadata."""
    contact = Contact.objects.create(
        first_name="D",
        last_name="Doc",
        email="doc@example.com",
        created_by=admin_user,
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    upload = SimpleUploadedFile("note.txt", b"hello", content_type="text/plain")
    response = client.post(
        "/api/v1/crm/documents/",
        {"contact": str(contact.id), "name": "Note", "file": upload},
        format="multipart",
    )
    assert response.status_code == 201
    body = _body(response)
    assert body["data"]["file_size"] > 0
    assert body["data"]["is_active"] is True


@pytest.mark.django_db
def test_complete_activity(admin_user):
    """Complete action sets completed_at."""
    contact = Contact.objects.create(
        first_name="E",
        last_name="Act",
        email="act@example.com",
        created_by=admin_user,
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    created = client.post(
        "/api/v1/crm/activities/",
        {
            "contact": str(contact.id),
            "activity_type": "task",
            "subject": "Follow up",
            "description": "",
            "is_completed": False,
        },
        format="json",
    )
    assert created.status_code == 201
    aid = _body(created)["data"]["id"]
    done = client.post(f"/api/v1/crm/activities/{aid}/complete/", {}, format="json")
    assert done.status_code == 200
    assert _body(done)["data"]["is_completed"] is True


@pytest.mark.django_db
def test_stale_contacts_task():
    """Celery task runs without error."""
    from apps.crm.tasks import check_stale_contacts

    n = check_stale_contacts()
    assert isinstance(n, int)

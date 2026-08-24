"""Tests for public lead ingest endpoint."""

from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from apps.crm.models import Activity, Contact, Deal, LeadEngineConfig


def _body(response):
    response.render()
    return json.loads(response.content.decode())


@pytest.fixture
def ingest_config(db):
    """Enable public ingest with a known API key."""

    cfg = LeadEngineConfig.objects.create(
        public_ingest_enabled=True,
        public_ingest_api_key="test-ingest-key-123",
        auto_create_contact=True,
        auto_create_deal=True,
        auto_create_follow_up=True,
    )
    return cfg


@pytest.mark.django_db
def test_public_lead_ingest_creates_contact_and_deal(ingest_config):
    client = APIClient()
    payload = {
        "email": "lead.web@example.com",
        "full_name": "Ana Web Lead",
        "phone_number": "+57 300 123 4567",
        "message": "Quiero información del producto",
        "company_name": "Acme Web",
        "source": "website",
    }
    response = client.post(
        "/api/v1/crm/leads/ingest/",
        payload,
        format="json",
        HTTP_X_LEAD_INGEST_KEY="test-ingest-key-123",
    )
    assert response.status_code == 201
    body = _body(response)
    assert body["status"] == "success"
    data = body["data"]
    assert data["is_new_contact"] is True
    assert data["is_new_deal"] is True
    assert Contact.objects.filter(email="lead.web@example.com").exists()
    assert Deal.objects.filter(contact__email="lead.web@example.com").exists()
    assert Activity.objects.filter(contact__email="lead.web@example.com").exists()


@pytest.mark.django_db
def test_public_lead_ingest_rejects_missing_api_key(ingest_config):
    client = APIClient()
    response = client.post(
        "/api/v1/crm/leads/ingest/",
        {"email": "x@example.com", "first_name": "X", "last_name": "Y"},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_public_lead_ingest_is_idempotent_by_email(ingest_config):
    client = APIClient()
    headers = {"HTTP_X_LEAD_INGEST_KEY": "test-ingest-key-123"}
    first = client.post(
        "/api/v1/crm/leads/ingest/",
        {"email": "repeat@example.com", "first_name": "Repeat", "last_name": "Lead"},
        format="json",
        **headers,
    )
    assert first.status_code == 201
    second = client.post(
        "/api/v1/crm/leads/ingest/",
        {"email": "repeat@example.com", "first_name": "Repeat", "last_name": "Lead"},
        format="json",
        **headers,
    )
    assert second.status_code == 200
    body = _body(second)
    assert body["data"]["is_new_contact"] is False
    assert body["data"]["is_new_deal"] is False
    assert Contact.objects.filter(email="repeat@example.com").count() == 1


@pytest.mark.django_db
def test_public_lead_ingest_honors_external_id(ingest_config):
    client = APIClient()
    headers = {"HTTP_X_LEAD_INGEST_KEY": "test-ingest-key-123"}
    payload = {
        "email": "other@example.com",
        "first_name": "External",
        "last_name": "Lead",
        "external_id": "form-submission-001",
    }
    first = client.post("/api/v1/crm/leads/ingest/", payload, format="json", **headers)
    assert first.status_code == 201

    payload["email"] = "changed@example.com"
    second = client.post("/api/v1/crm/leads/ingest/", payload, format="json", **headers)
    assert second.status_code == 200
    body = _body(second)
    assert body["data"]["is_new_contact"] is False
    contact = Contact.objects.get(custom_fields__external_lead_id="form-submission-001")
    assert contact.email == "other@example.com"


@pytest.mark.django_db
def test_public_lead_ingest_disabled_returns_forbidden(db):
    LeadEngineConfig.objects.create(public_ingest_enabled=False, public_ingest_api_key="secret")
    client = APIClient()
    response = client.post(
        "/api/v1/crm/leads/ingest/",
        {"email": "x@example.com", "first_name": "X", "last_name": "Y"},
        format="json",
        HTTP_X_LEAD_INGEST_KEY="secret",
    )
    assert response.status_code == 403

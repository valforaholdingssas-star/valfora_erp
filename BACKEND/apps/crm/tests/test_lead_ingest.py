"""Tests for public lead ingest endpoint."""

from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from apps.crm.models import Activity, Contact, Deal, LeadEngineConfig, PipelineStage


def _body(response):
    response.render()
    return json.loads(response.content.decode())


@pytest.fixture
def ingest_config(db):
    """Enable public ingest with a known API key."""

    PipelineStage.objects.get_or_create(
        key="web",
        defaults={
            "name": "LEADS PG WEB",
            "position": 99,
            "accent_color": "#ef4444",
            "tint_color": "rgba(239, 68, 68, 0.14)",
        },
    )
    cfg = LeadEngineConfig.objects.create(
        public_ingest_enabled=True,
        public_ingest_api_key="test-ingest-key-123",
        public_ingest_allowed_origins=["https://3orillas.com", "https://www.3orillas.com"],
        public_ingest_pipeline_stage="web",
        auto_create_contact=True,
        auto_create_deal=True,
        auto_create_follow_up=True,
    )
    return cfg


def _ingest_headers(api_key: str = "test-ingest-key-123", origin: str = "https://3orillas.com") -> dict:
    return {
        "HTTP_X_LEAD_INGEST_KEY": api_key,
        "HTTP_ORIGIN": origin,
    }


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
        **_ingest_headers(),
    )
    assert response.status_code == 201
    body = _body(response)
    assert body["status"] == "success"
    data = body["data"]
    assert data["is_new_contact"] is True
    assert data["is_new_deal"] is True
    assert data["contact_email"] == "lead.web@example.com"
    assert Contact.objects.filter(email="lead.web@example.com").exists()
    deal = Deal.objects.get(contact__email="lead.web@example.com")
    assert deal.title.startswith("Lead Web -")
    assert deal.stage == "web"
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
def test_public_lead_ingest_rejects_unlisted_origin(ingest_config):
    client = APIClient()
    response = client.post(
        "/api/v1/crm/leads/ingest/",
        {"email": "blocked@example.com", "first_name": "X", "last_name": "Y"},
        format="json",
        **_ingest_headers(origin="https://evil.example.com"),
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_public_lead_ingest_cors_preflight_allows_3orillas(ingest_config):
    client = APIClient()
    response = client.options(
        "/api/v1/crm/leads/ingest/",
        HTTP_ORIGIN="https://3orillas.com",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,x-lead-ingest-key",
    )
    assert response.status_code == 204
    assert response["Access-Control-Allow-Origin"] == "https://3orillas.com"
    assert "x-lead-ingest-key" in response["Access-Control-Allow-Headers"].lower()


@pytest.mark.django_db
def test_public_lead_ingest_is_idempotent_by_email(ingest_config):
    client = APIClient()
    headers = _ingest_headers()
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
    headers = _ingest_headers()
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
        **_ingest_headers(api_key="secret"),
    )
    assert response.status_code == 403

"""Health endpoint tests."""

import json

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_returns_200_and_database_ok() -> None:
    """Health check reports database connectivity."""
    client = APIClient()
    response = client.get("/api/v1/health/")
    assert response.status_code == 200
    response.render()
    body = json.loads(response.content.decode())
    assert body["status"] == "success"
    assert body["data"]["database"] == "ok"

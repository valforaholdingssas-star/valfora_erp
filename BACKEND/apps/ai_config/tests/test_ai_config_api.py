"""Tests for AI configuration API."""

import json
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.ai_config.models import AIConfiguration
from apps.ai_config.services import CompletionResult


def _j(resp):
    resp.render()
    return json.loads(resp.content.decode())


@pytest.mark.django_db
def test_ai_config_list_requires_admin(collaborator_user):
    client = APIClient()
    client.force_authenticate(user=collaborator_user)
    res = client.get("/api/v1/ai-config/configurations/")
    assert res.status_code == 403


@pytest.mark.django_db
def test_ai_config_list_admin(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    res = client.get("/api/v1/ai-config/configurations/")
    assert res.status_code == 200
    body = _j(res)
    data = body["data"]
    assert isinstance(data, dict)
    assert len(data.get("results", [])) >= 1


@pytest.mark.django_db
@patch("apps.ai_config.viewsets.generate_chat_completion")
def test_ai_config_test_sandbox(mock_completion, admin_user):
    mock_completion.return_value = CompletionResult(
        text="Respuesta de prueba",
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
    )
    cfg = AIConfiguration.objects.filter(is_active=True).first()
    assert cfg is not None
    client = APIClient()
    client.force_authenticate(user=admin_user)
    res = client.post(
        f"/api/v1/ai-config/configurations/{cfg.id}/test/",
        {"message": "Hola"},
        format="json",
    )
    assert res.status_code == 200
    body = _j(res)
    assert body["status"] == "success"
    inner = body["data"]
    assert inner["reply"] == "Respuesta de prueba"
    assert inner["total_tokens"] == 15
    mock_completion.assert_called_once()

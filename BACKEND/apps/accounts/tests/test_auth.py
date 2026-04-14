"""Authentication and authorization tests."""

import json

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

User = get_user_model()


def _json_response(response):
    response.render()
    return json.loads(response.content.decode())


@pytest.mark.django_db
def test_login_returns_tokens() -> None:
    """Login endpoint returns JWT tokens for valid credentials."""
    User.objects.create_user(email="admin@valfora.com", password="StrongPass123!")
    client = APIClient()
    response = client.post(
        "/api/v1/auth/login/",
        {"email": "admin@valfora.com", "password": "StrongPass123!"},
        format="json",
    )
    assert response.status_code == 200
    body = _json_response(response)
    assert body["status"] == "success"
    assert "access" in body["data"]
    assert "refresh" in body["data"]


@pytest.mark.django_db
def test_login_invalid_credentials_returns_401() -> None:
    """Wrong password yields authentication error."""
    User.objects.create_user(email="u@test.com", password="StrongPass123!")
    client = APIClient()
    response = client.post(
        "/api/v1/auth/login/",
        {"email": "u@test.com", "password": "WrongPassword999!"},
        format="json",
    )
    assert response.status_code == 401
    body = _json_response(response)
    assert body["status"] == "error"


@pytest.mark.django_db
def test_me_requires_authentication() -> None:
    """Profile endpoint rejects unauthenticated requests."""
    client = APIClient()
    response = client.get("/api/v1/auth/me/")
    assert response.status_code == 401


@pytest.mark.django_db
def test_me_returns_profile_when_authenticated(admin_user) -> None:
    """Authenticated user receives profile payload."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get("/api/v1/auth/me/")
    assert response.status_code == 200
    body = _json_response(response)
    assert body["data"]["email"] == "admin@test.com"
    assert body["data"]["role"] == "admin"


@pytest.mark.django_db
def test_me_cannot_escalate_role_or_disable_self(collaborator_user) -> None:
    """Profile endpoint must not allow role/escalation fields update."""
    client = APIClient()
    client.force_authenticate(user=collaborator_user)
    response = client.patch(
        "/api/v1/auth/me/",
        {
            "first_name": "Colab",
            "role": "super_admin",
            "is_active": False,
        },
        format="json",
    )
    assert response.status_code == 200
    collaborator_user.refresh_from_db()
    assert collaborator_user.first_name == "Colab"
    assert collaborator_user.role == "collaborator"
    assert collaborator_user.is_active is True


@pytest.mark.django_db
def test_users_list_requires_admin(collaborator_user) -> None:
    """User list is forbidden for collaborators."""
    client = APIClient()
    client.force_authenticate(user=collaborator_user)
    response = client.get("/api/v1/users/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_register_forbidden_for_collaborator(collaborator_user) -> None:
    """Only admin+ can create users via register endpoint."""
    client = APIClient()
    client.force_authenticate(user=collaborator_user)
    response = client.post(
        "/api/v1/auth/register/",
        {
            "email": "new@test.com",
            "password": "StrongPass123!",
            "first_name": "N",
            "last_name": "User",
            "role": "collaborator",
        },
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_register_admin_creates_user(admin_user) -> None:
    """Admin can register a new user."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.post(
        "/api/v1/auth/register/",
        {
            "email": "newhire@test.com",
            "password": "StrongPass123!",
            "first_name": "New",
            "last_name": "Hire",
            "role": "collaborator",
        },
        format="json",
    )
    assert response.status_code == 201
    assert User.objects.filter(email="newhire@test.com").exists()


@pytest.mark.django_db
def test_logout_blacklists_refresh_token() -> None:
    """After logout, refresh token cannot be used."""
    User.objects.create_user(email="tok@test.com", password="StrongPass123!")
    client = APIClient()
    login = client.post(
        "/api/v1/auth/login/",
        {"email": "tok@test.com", "password": "StrongPass123!"},
        format="json",
    )
    body = _json_response(login)
    access = body["data"]["access"]
    refresh = body["data"]["refresh"]

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    out = client.post("/api/v1/auth/logout/", {"refresh": refresh}, format="json")
    assert out.status_code == 200

    refresh_resp = client.post("/api/v1/auth/refresh/", {"refresh": refresh}, format="json")
    assert refresh_resp.status_code == 401


@pytest.mark.django_db
def test_admin_cannot_delete_user(admin_user, collaborator_user) -> None:
    """Soft-delete user is reserved for super_admin."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.delete(f"/api/v1/users/{collaborator_user.pk}/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_super_admin_soft_deletes_user(super_admin_user, collaborator_user) -> None:
    """Super admin can deactivate a user."""
    client = APIClient()
    client.force_authenticate(user=super_admin_user)
    response = client.delete(f"/api/v1/users/{collaborator_user.pk}/")
    assert response.status_code == 204
    collaborator_user.refresh_from_db()
    assert collaborator_user.is_active is False


@pytest.mark.django_db
def test_permissions_list_requires_admin(collaborator_user) -> None:
    """Permissions endpoint is admin+ only."""
    client = APIClient()
    client.force_authenticate(user=collaborator_user)
    response = client.get("/api/v1/permissions/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_permissions_list_ok_for_admin(admin_user) -> None:
    """Admin can list permissions (may be empty)."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get("/api/v1/permissions/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_password_reset_confirm_changes_password() -> None:
    """Password reset confirm updates credentials."""
    user = User.objects.create_user(email="reset@test.com", password="StrongPass123!")
    uid = urlsafe_base64_encode(force_bytes(str(user.pk)))
    token = default_token_generator.make_token(user)
    client = APIClient()
    response = client.post(
        "/api/v1/auth/password-reset-confirm/",
        {"uid": uid, "token": token, "password": "NewStrongPass456!"},
        format="json",
    )
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.check_password("NewStrongPass456!")


@pytest.mark.django_db
def test_password_reset_request_sends_email(admin_user, mailoutbox) -> None:
    """Password reset request triggers an email to existing user."""
    client = APIClient()
    response = client.post(
        "/api/v1/auth/password-reset/",
        {"email": admin_user.email},
        format="json",
    )
    assert response.status_code == 200
    assert len(mailoutbox) == 1
    assert admin_user.email in mailoutbox[0].to

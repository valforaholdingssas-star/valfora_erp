"""Shared pytest fixtures for the backend."""

import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.fixture
def collaborator_user(db):
    """Usuario con rol collaborator."""
    return User.objects.create_user(
        email="collab@test.com",
        password="StrongPass123!",
        role="collaborator",
    )


@pytest.fixture
def admin_user(db):
    """Usuario con rol admin."""
    return User.objects.create_user(
        email="admin@test.com",
        password="StrongPass123!",
        role="admin",
    )


@pytest.fixture
def super_admin_user(db):
    """Usuario con rol super_admin."""
    return User.objects.create_user(
        email="super@test.com",
        password="StrongPass123!",
        role="super_admin",
    )

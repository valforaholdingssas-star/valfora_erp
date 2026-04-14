"""Accounts and authorization models."""

from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.common.models import BaseModel
from .managers import UserManager

SYSTEM_ROLE_CHOICES = (
    ("super_admin", "Super Admin"),
    ("admin", "Admin"),
    ("collaborator", "Collaborator"),
)


class Permission(BaseModel):
    """Granular action permission by module."""

    ACTION_CHOICES = (
        ("view", "View"),
        ("create", "Create"),
        ("edit", "Edit"),
        ("delete", "Delete"),
    )
    codename = models.CharField(max_length=120, unique=True, db_index=True)
    module = models.CharField(max_length=80, db_index=True)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    description = models.CharField(max_length=255)

    class Meta:
        verbose_name = "Permission"
        verbose_name_plural = "Permissions"

    def __str__(self) -> str:
        """Readable permission identity."""
        return self.codename


class Role(BaseModel):
    """Role model for future custom RBAC."""

    name = models.CharField(max_length=80, unique=True, db_index=True)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(Permission, blank=True, related_name="roles")

    class Meta:
        verbose_name = "Role"
        verbose_name_plural = "Roles"

    def __str__(self) -> str:
        """Readable role identity."""
        return self.name


class RolePermissionProfile(BaseModel):
    """Permission matrix profile per built-in user role."""

    role_code = models.CharField(max_length=20, choices=SYSTEM_ROLE_CHOICES, unique=True, db_index=True)
    permissions = models.ManyToManyField(Permission, blank=True, related_name="role_profiles")

    class Meta:
        verbose_name = "Role Permission Profile"
        verbose_name_plural = "Role Permission Profiles"

    def __str__(self) -> str:
        return f"{self.role_code} permissions"


class User(AbstractUser, BaseModel):
    """Custom user model using email as identifier."""

    ROLE_CHOICES = SYSTEM_ROLE_CHOICES

    username = None
    email = models.EmailField(unique=True, db_index=True)
    phone_number = models.CharField(max_length=40, blank=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="collaborator")
    last_login_ip = models.GenericIPAddressField(blank=True, null=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self) -> str:
        """Readable user representation."""
        return self.email

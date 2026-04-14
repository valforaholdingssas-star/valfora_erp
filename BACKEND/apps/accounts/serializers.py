"""Serializers for authentication and user management."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Permission, Role, RolePermissionProfile
from .rbac import effective_module_permissions_for_role, effective_permission_codenames_for_role

User = get_user_model()


class PermissionSerializer(serializers.ModelSerializer):
    """Serializer for granular permissions."""

    class Meta:
        model = Permission
        fields = (
            "id",
            "codename",
            "module",
            "action",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class RoleSerializer(serializers.ModelSerializer):
    """Serializer for custom roles."""

    permissions = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Permission.objects.filter(is_active=True),
        required=False,
    )

    class Meta:
        model = Role
        fields = (
            "id",
            "name",
            "description",
            "permissions",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user read/write operations."""

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class MeSerializer(serializers.ModelSerializer):
    """Serializer for the current user profile endpoint."""

    permissions = serializers.SerializerMethodField()
    module_permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "avatar",
            "role",
            "permissions",
            "module_permissions",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "email",
            "role",
            "is_active",
            "created_at",
            "updated_at",
        )

    def get_permissions(self, obj):
        return effective_permission_codenames_for_role(getattr(obj, "role", ""))

    def get_module_permissions(self, obj):
        return effective_module_permissions_for_role(getattr(obj, "role", ""))


class RolePermissionProfileSerializer(serializers.ModelSerializer):
    """Role permission profile by built-in role code."""

    permissions = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Permission.objects.filter(is_active=True),
        required=False,
    )

    class Meta:
        model = RolePermissionProfile
        fields = ("id", "role_code", "permissions", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer used by admin users to register new users."""

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("email", "password", "first_name", "last_name", "phone_number", "role")

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        email = validated_data.pop("email")
        return User.objects.create_user(email, password, **validated_data)


class PasswordResetRequestSerializer(serializers.Serializer):
    """Request password reset email."""

    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Confirm password reset with uid and token."""

    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

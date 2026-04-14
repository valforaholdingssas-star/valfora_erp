"""Reusable custom permissions."""

from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    """Allow access only to super admin users."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role == "super_admin")

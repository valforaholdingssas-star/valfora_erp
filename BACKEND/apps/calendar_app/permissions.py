"""Permissions for calendar module."""

from rest_framework.permissions import BasePermission

from apps.accounts.rbac import user_has_module_permission


class IsCalendarUser(BasePermission):
    """Require calendar view permission."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user_has_module_permission(user, "calendar", "view")


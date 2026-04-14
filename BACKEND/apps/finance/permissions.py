"""Permissions for finance module."""

from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.accounts.rbac import user_has_module_permission


class IsFinanceWriteAdmin(BasePermission):
    """Allow writes only for admin and super_admin."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return user_has_module_permission(user, "finance", "view")
        return user_has_module_permission(user, "finance", "edit")

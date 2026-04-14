"""Permissions for CRM API."""

from rest_framework.permissions import BasePermission

from apps.accounts.rbac import method_to_action, user_has_module_permission


class IsCRMUser(BasePermission):
    """Allow authenticated users with CRM roles (all project roles)."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user_has_module_permission(user, "crm", method_to_action(request.method))


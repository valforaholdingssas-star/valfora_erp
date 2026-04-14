"""Permissions for chat API (aligned with CRM roles)."""

from rest_framework.permissions import BasePermission

from apps.accounts.rbac import method_to_action, user_has_module_permission


class IsChatUser(BasePermission):
    """Authenticated users with project CRM-style roles."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user_has_module_permission(user, "chat", method_to_action(request.method))

"""Permissions for LinkedIn module."""

from rest_framework.permissions import BasePermission

from apps.accounts.rbac import method_to_action, user_has_module_permission


class IsLinkedInUser(BasePermission):
    """Allow access based on LinkedIn module RBAC matrix."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user_has_module_permission(user, "linkedin", method_to_action(request.method))


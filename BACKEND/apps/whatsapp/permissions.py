"""Permissions for WhatsApp admin endpoints."""

from rest_framework.permissions import BasePermission

from apps.accounts.rbac import method_to_action, user_has_module_permission


class IsWhatsAppAdmin(BasePermission):
    """Allow admins and super admins."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user_has_module_permission(user, "whatsapp", method_to_action(request.method))


class IsSuperAdminOnly(BasePermission):
    """Allow only super admin users."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "role", None) == "super_admin")

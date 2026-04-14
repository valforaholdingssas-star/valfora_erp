"""Custom permissions for accounts app."""

from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.accounts.rbac import method_to_action, user_has_module_permission


class IsAdminOrSuperAdmin(BasePermission):
    """Allow only admin and super admin roles."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.role in {"admin", "super_admin"}
        )


class IsSelfOrAdmin(BasePermission):
    """Allow users to edit themselves, admins all users."""

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user
        if request.method in SAFE_METHODS:
            return bool(user and user.is_authenticated)
        return bool(
            user
            and user.is_authenticated
            and (obj.id == user.id or user.role in {"admin", "super_admin"})
        )


class IsSuperAdmin(BasePermission):
    """Allow only super_admin role."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user and user.is_authenticated and getattr(user, "role", None) == "super_admin"
        )


class HasUsersModulePermission(BasePermission):
    """Require users module permission according to HTTP method."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user_has_module_permission(user, "users", method_to_action(request.method))

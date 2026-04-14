"""ViewSets for user administration and RBAC resources."""

from django.contrib.auth import get_user_model
from rest_framework import permissions, viewsets

from .models import Permission, Role
from .permissions import HasUsersModulePermission, IsAdminOrSuperAdmin, IsSuperAdmin
from .serializers import (
    PermissionSerializer,
    RegisterSerializer,
    RoleSerializer,
    UserSerializer,
)

User = get_user_model()


class UserViewSet(viewsets.ModelViewSet):
    """CRUD endpoint for users."""

    queryset = User.objects.all().order_by("-created_at")
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    search_fields = ["email", "first_name", "last_name"]
    ordering_fields = ["created_at", "email"]

    def get_serializer_class(self):
        if self.action == "create":
            return RegisterSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == "destroy":
            return [permissions.IsAuthenticated(), IsSuperAdmin(), HasUsersModulePermission()]
        return [permissions.IsAuthenticated(), IsAdminOrSuperAdmin(), HasUsersModulePermission()]

    def perform_destroy(self, instance) -> None:
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])


class RoleViewSet(viewsets.ModelViewSet):
    """Manage custom roles (create/update/delete: super_admin only)."""

    queryset = Role.objects.all().order_by("name")
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated]
    search_fields = ["name", "description"]
    ordering_fields = ["created_at", "name"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsSuperAdmin(), HasUsersModulePermission()]
        return [permissions.IsAuthenticated(), IsAdminOrSuperAdmin(), HasUsersModulePermission()]


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """List granular permissions."""

    queryset = Permission.objects.filter(is_active=True).order_by("module", "codename")
    serializer_class = PermissionSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrSuperAdmin, HasUsersModulePermission]
    search_fields = ["codename", "module", "description"]
    ordering_fields = ["module", "codename"]

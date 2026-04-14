"""Resource URL routes (users, roles, permissions)."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import RolePermissionMatrixView
from .viewsets import PermissionViewSet, RoleViewSet, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("roles", RoleViewSet, basename="role")
router.register("permissions", PermissionViewSet, basename="permission")

urlpatterns = [
    path("rbac/role-matrix/", RolePermissionMatrixView.as_view(), name="role-permission-matrix"),
    path("", include(router.urls)),
]

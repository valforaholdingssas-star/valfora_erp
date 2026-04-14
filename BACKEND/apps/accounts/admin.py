"""Django admin registrations for accounts."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Permission, Role, RolePermissionProfile, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Admin configuration for custom user."""

    ordering = ("-created_at",)
    list_display = ("email", "first_name", "last_name", "role", "is_active")
    list_filter = ("role", "is_active", "is_staff")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone_number", "avatar")}),
        ("Permissions", {"fields": ("role", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2", "role", "is_active"),
            },
        ),
    )


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    """Admin config for Role model."""

    list_display = ("name", "is_active", "created_at")
    search_fields = ("name",)


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    """Admin config for Permission model."""

    list_display = ("codename", "module", "action", "is_active")
    search_fields = ("codename", "module")


@admin.register(RolePermissionProfile)
class RolePermissionProfileAdmin(admin.ModelAdmin):
    """Admin config for role permission profile."""

    list_display = ("role_code", "is_active", "created_at")
    search_fields = ("role_code",)
    filter_horizontal = ("permissions",)

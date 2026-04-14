from django.db import migrations, models
import uuid


MODULES = (
    "crm",
    "chat",
    "calendar",
    "finance",
    "users",
    "whatsapp",
    "ai_config",
)

DEFAULT_ROLE_MATRIX = {
    "super_admin": {module: {"view": True, "edit": True} for module in MODULES},
    "admin": {module: {"view": True, "edit": True} for module in MODULES},
    "collaborator": {
        "crm": {"view": True, "edit": True},
        "chat": {"view": True, "edit": True},
        "calendar": {"view": True, "edit": True},
        "finance": {"view": True, "edit": False},
        "users": {"view": False, "edit": False},
        "whatsapp": {"view": False, "edit": False},
        "ai_config": {"view": False, "edit": False},
    },
}


def seed_permissions_and_profiles(apps, schema_editor):
    Permission = apps.get_model("accounts", "Permission")
    RolePermissionProfile = apps.get_model("accounts", "RolePermissionProfile")

    permission_ids = {}
    for module in MODULES:
        for action in ("view", "edit"):
            codename = f"{module}.{action}"
            perm, _ = Permission.objects.get_or_create(
                codename=codename,
                defaults={
                    "module": module,
                    "action": action,
                    "description": f"{action.title()} access to {module} module",
                    "is_active": True,
                },
            )
            permission_ids[(module, action)] = perm.id

    through = RolePermissionProfile.permissions.through
    for role_code, modules in DEFAULT_ROLE_MATRIX.items():
        profile, _ = RolePermissionProfile.objects.get_or_create(role_code=role_code)
        through.objects.filter(rolepermissionprofile_id=profile.id).delete()
        links = []
        for module, actions in modules.items():
            for action, allowed in actions.items():
                if not allowed:
                    continue
                perm_id = permission_ids.get((module, action))
                if perm_id:
                    links.append(
                        through(
                            rolepermissionprofile_id=profile.id,
                            permission_id=perm_id,
                        )
                    )
        if links:
            through.objects.bulk_create(links, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="RolePermissionProfile",
            fields=[
                (
                    "id",
                    models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "role_code",
                    models.CharField(
                        choices=[
                            ("super_admin", "Super Admin"),
                            ("admin", "Admin"),
                            ("collaborator", "Collaborator"),
                        ],
                        db_index=True,
                        max_length=20,
                        unique=True,
                    ),
                ),
                (
                    "permissions",
                    models.ManyToManyField(
                        blank=True,
                        related_name="role_profiles",
                        to="accounts.permission",
                    ),
                ),
            ],
            options={
                "verbose_name": "Role Permission Profile",
                "verbose_name_plural": "Role Permission Profiles",
            },
        ),
        migrations.RunPython(seed_permissions_and_profiles, migrations.RunPython.noop),
    ]

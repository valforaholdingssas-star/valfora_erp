from django.db import migrations


def add_linkedin_permissions(apps, schema_editor):
    Permission = apps.get_model("accounts", "Permission")
    RolePermissionProfile = apps.get_model("accounts", "RolePermissionProfile")
    through = RolePermissionProfile.permissions.through

    view_perm, _ = Permission.objects.get_or_create(
        codename="linkedin.view",
        defaults={
            "module": "linkedin",
            "action": "view",
            "description": "View access to linkedin module",
            "is_active": True,
        },
    )
    edit_perm, _ = Permission.objects.get_or_create(
        codename="linkedin.edit",
        defaults={
            "module": "linkedin",
            "action": "edit",
            "description": "Edit access to linkedin module",
            "is_active": True,
        },
    )

    role_to_permissions = {
        "super_admin": [view_perm.id, edit_perm.id],
        "admin": [view_perm.id, edit_perm.id],
        "collaborator": [],
    }

    for role_code, permission_ids in role_to_permissions.items():
        profile = RolePermissionProfile.objects.filter(role_code=role_code).first()
        if not profile:
            continue
        for permission_id in permission_ids:
            through.objects.get_or_create(rolepermissionprofile_id=profile.id, permission_id=permission_id)


def remove_linkedin_permissions(apps, schema_editor):
    Permission = apps.get_model("accounts", "Permission")
    Permission.objects.filter(codename__in=["linkedin.view", "linkedin.edit"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_add_wiki_module_permissions"),
    ]

    operations = [
        migrations.RunPython(add_linkedin_permissions, remove_linkedin_permissions),
    ]


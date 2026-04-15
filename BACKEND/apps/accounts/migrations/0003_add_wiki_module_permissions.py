from django.db import migrations


def add_wiki_permissions(apps, schema_editor):
    Permission = apps.get_model("accounts", "Permission")
    RolePermissionProfile = apps.get_model("accounts", "RolePermissionProfile")
    through = RolePermissionProfile.permissions.through

    view_perm, _ = Permission.objects.get_or_create(
        codename="wiki.view",
        defaults={
            "module": "wiki",
            "action": "view",
            "description": "View access to wiki module",
            "is_active": True,
        },
    )
    edit_perm, _ = Permission.objects.get_or_create(
        codename="wiki.edit",
        defaults={
            "module": "wiki",
            "action": "edit",
            "description": "Edit access to wiki module",
            "is_active": True,
        },
    )

    role_to_permissions = {
        "super_admin": [view_perm.id, edit_perm.id],
        "admin": [view_perm.id, edit_perm.id],
        "collaborator": [view_perm.id],
    }

    for role_code, permission_ids in role_to_permissions.items():
        profile = RolePermissionProfile.objects.filter(role_code=role_code).first()
        if not profile:
            continue
        for permission_id in permission_ids:
            through.objects.get_or_create(rolepermissionprofile_id=profile.id, permission_id=permission_id)


def remove_wiki_permissions(apps, schema_editor):
    Permission = apps.get_model("accounts", "Permission")
    Permission.objects.filter(codename__in=["wiki.view", "wiki.edit"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_rolepermissionprofile_and_seed_module_permissions"),
    ]

    operations = [
        migrations.RunPython(add_wiki_permissions, remove_wiki_permissions),
    ]


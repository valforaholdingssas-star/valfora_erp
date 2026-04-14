from rest_framework.test import APIClient

from apps.accounts.models import Permission, RolePermissionProfile


def _role_permissions(role_code: str):
    profile = RolePermissionProfile.objects.get(role_code=role_code)
    return set(profile.permissions.values_list("codename", flat=True))


def test_role_matrix_get_for_admin(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get("/api/v1/rbac/role-matrix/")
    assert response.status_code == 200
    body = response.json()
    data = body.get("data", body)
    assert "roles" in data
    assert "modules" in data
    assert "matrix" in data
    assert any(x["role"] == "admin" for x in data["roles"])


def test_role_matrix_patch_updates_permissions(super_admin_user):
    client = APIClient()
    client.force_authenticate(user=super_admin_user)

    finance_view = Permission.objects.get(codename="finance.view")
    finance_edit = Permission.objects.get(codename="finance.edit")

    payload = {
        "matrix": {
            "collaborator": {
                "finance": {"view": True, "edit": True},
            }
        }
    }
    response = client.patch("/api/v1/rbac/role-matrix/", payload, format="json")
    assert response.status_code == 200

    perms = _role_permissions("collaborator")
    assert finance_view.codename in perms
    assert finance_edit.codename in perms


def test_me_includes_module_permissions_and_codenames(collaborator_user):
    client = APIClient()
    client.force_authenticate(user=collaborator_user)
    response = client.get("/api/v1/auth/me/")
    assert response.status_code == 200
    body = response.json()
    data = body.get("data", body)
    assert "permissions" in data
    assert "module_permissions" in data
    assert "crm" in data["module_permissions"]
    assert "view" in data["module_permissions"]["crm"]
    assert "edit" in data["module_permissions"]["crm"]

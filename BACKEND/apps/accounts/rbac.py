"""RBAC helpers for module-level permissions by role."""

from __future__ import annotations

from functools import lru_cache

from apps.accounts.models import Permission, RolePermissionProfile

MODULES = (
    "crm",
    "chat",
    "calendar",
    "finance",
    "users",
    "whatsapp",
    "ai_config",
    "wiki",
)

DEFAULT_ROLE_MATRIX = {
    "super_admin": {module: {"view": True, "edit": True} for module in MODULES},
    "admin": {
        "crm": {"view": True, "edit": True},
        "chat": {"view": True, "edit": True},
        "calendar": {"view": True, "edit": True},
        "finance": {"view": True, "edit": True},
        "users": {"view": True, "edit": True},
        "whatsapp": {"view": True, "edit": True},
        "ai_config": {"view": True, "edit": True},
        "wiki": {"view": True, "edit": True},
    },
    "collaborator": {
        "crm": {"view": True, "edit": True},
        "chat": {"view": True, "edit": True},
        "calendar": {"view": True, "edit": True},
        "finance": {"view": True, "edit": False},
        "users": {"view": False, "edit": False},
        "whatsapp": {"view": False, "edit": False},
        "ai_config": {"view": False, "edit": False},
        "wiki": {"view": True, "edit": False},
    },
}


def _as_bool(role: str | None, module: str, action: str) -> bool:
    return bool(DEFAULT_ROLE_MATRIX.get(role or "", {}).get(module, {}).get(action, False))


def method_to_action(method: str) -> str:
    return "view" if method in {"GET", "HEAD", "OPTIONS"} else "edit"


@lru_cache(maxsize=64)
def _permission_lookup() -> dict[tuple[str, str], str]:
    lookup: dict[tuple[str, str], str] = {}
    for row in Permission.objects.filter(is_active=True).values("module", "action", "codename"):
        lookup[(row["module"], row["action"])] = row["codename"]
    return lookup


def clear_rbac_cache() -> None:
    _permission_lookup.cache_clear()


def effective_module_permissions_for_role(role_code: str) -> dict[str, dict[str, bool]]:
    matrix = {
        module: {
            "view": _as_bool(role_code, module, "view"),
            "edit": _as_bool(role_code, module, "edit"),
        }
        for module in MODULES
    }
    if role_code == "super_admin":
        return matrix

    profile = (
        RolePermissionProfile.objects.filter(role_code=role_code)
        .prefetch_related("permissions")
        .first()
    )
    if not profile:
        return matrix

    granted = {(p.module, p.action) for p in profile.permissions.all() if p.is_active}
    for module in MODULES:
        for action in ("view", "edit"):
            matrix[module][action] = (module, action) in granted
    return matrix


def effective_permission_codenames_for_role(role_code: str) -> list[str]:
    matrix = effective_module_permissions_for_role(role_code)
    lookup = _permission_lookup()
    out: list[str] = []
    for module, actions in matrix.items():
        for action, allowed in actions.items():
            if not allowed:
                continue
            codename = lookup.get((module, action), f"{module}.{action}")
            out.append(codename)
    return sorted(set(out))


def user_has_module_permission(user, module: str, action: str) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    role = getattr(user, "role", "")
    if role == "super_admin":
        return True
    return bool(effective_module_permissions_for_role(role).get(module, {}).get(action, False))

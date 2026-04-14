"""Service layer for accounts business logic."""

from django.contrib.auth import get_user_model

User = get_user_model()


def deactivate_user(user_id):
    """Soft-delete user by setting is_active=False."""
    user = User.objects.get(id=user_id)
    user.is_active = False
    user.save(update_fields=["is_active", "updated_at"])
    return user

"""Serializers for shared/common API resources."""

from rest_framework import serializers

from apps.common.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """Read serializer for user activity/audit rows."""

    user_id = serializers.UUIDField(source="user.id", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "created_at",
            "action",
            "model_name",
            "object_id",
            "changes",
            "ip_address",
            "user_agent",
            "user_id",
            "user_email",
            "user_name",
        ]

    def get_user_name(self, obj) -> str:
        user = getattr(obj, "user", None)
        if not user:
            return ""
        full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full_name or ""

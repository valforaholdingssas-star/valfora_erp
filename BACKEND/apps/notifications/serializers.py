"""Serializers for notifications API."""

from rest_framework import serializers

from apps.notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """Full notification row."""

    class Meta:
        model = Notification
        fields = (
            "id",
            "notification_type",
            "title",
            "message",
            "is_read",
            "action_url",
            "related_object_type",
            "related_object_id",
            "created_at",
        )
        read_only_fields = fields

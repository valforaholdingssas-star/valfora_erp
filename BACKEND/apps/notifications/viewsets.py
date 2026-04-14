"""API for listing and marking notifications read."""

from django.core.cache import cache
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """Current user's notifications."""

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ("is_read", "notification_type")
    ordering_fields = ("created_at",)
    ordering = ["-created_at"]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user, is_active=True)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        """Mark every notification as read for this user."""
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        cache.delete(f"platform_dashboard:{request.user.id}")
        return Response({"marked": updated}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        """Mark one notification read."""
        n = self.get_object()
        if not n.is_read:
            n.is_read = True
            n.save(update_fields=["is_read", "updated_at"])
            cache.delete(f"platform_dashboard:{request.user.id}")
        return Response(NotificationSerializer(n).data, status=status.HTTP_200_OK)

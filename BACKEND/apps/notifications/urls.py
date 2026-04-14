"""URL routes for notifications."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.notifications.viewsets import NotificationViewSet

router = DefaultRouter()
router.register("", NotificationViewSet, basename="notification")

urlpatterns = [
    path("", include(router.urls)),
]

"""URL routes for AI configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.ai_config.viewsets import AIConfigurationViewSet

router = DefaultRouter()
router.register("configurations", AIConfigurationViewSet, basename="ai-configuration")

urlpatterns = [
    path("", include(router.urls)),
]

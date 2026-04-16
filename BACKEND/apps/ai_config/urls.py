"""URL routes for AI configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.ai_config.viewsets import AIConfigurationViewSet, AIRuntimeSettingsView

router = DefaultRouter()
router.register("configurations", AIConfigurationViewSet, basename="ai-configuration")

urlpatterns = [
    path("runtime-settings/current/", AIRuntimeSettingsView.as_view(), name="ai-runtime-settings-current"),
    path("", include(router.urls)),
]

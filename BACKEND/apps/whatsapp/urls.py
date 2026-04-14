"""URLs for WhatsApp integration app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.whatsapp import views
from apps.whatsapp.viewsets import (
    WhatsAppAnalyticsViewSet,
    WhatsAppBusinessAccountViewSet,
    WhatsAppBusinessProfileViewSet,
    WhatsAppPhoneNumberViewSet,
    WhatsAppTemplateViewSet,
)

router = DefaultRouter()
router.register("accounts", WhatsAppBusinessAccountViewSet, basename="whatsapp-account")
router.register("phone-numbers", WhatsAppPhoneNumberViewSet, basename="whatsapp-phone")
router.register("templates", WhatsAppTemplateViewSet, basename="whatsapp-template")
router.register("profile", WhatsAppBusinessProfileViewSet, basename="whatsapp-profile")
router.register("analytics", WhatsAppAnalyticsViewSet, basename="whatsapp-analytics")

urlpatterns = [
    path("webhook/", views.whatsapp_webhook, name="whatsapp-webhook"),
    path("", include(router.urls)),
]

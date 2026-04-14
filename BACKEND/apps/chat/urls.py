"""REST URLs for chat + WhatsApp webhook."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.chat import webhook_views
from apps.chat.viewsets import ConversationViewSet

router = DefaultRouter()
router.register("conversations", ConversationViewSet, basename="chat-conversation")

urlpatterns = [
    path("webhooks/whatsapp/", webhook_views.whatsapp_webhook, name="whatsapp-webhook"),
    path("", include(router.urls)),
]

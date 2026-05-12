"""URL routes for LinkedIn module."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.linkedin.viewsets import (
    InvitationTemplateViewSet,
    LinkedInAccountViewSet,
    LinkedInDashboardView,
    LinkedInFunnelStageView,
    LinkedInFunnelSummaryView,
    LinkedInInvitationsView,
    LinkedInInvitationStatsView,
    LinkedInMessagesViewSet,
    LinkedInProspectViewSet,
    MessageTemplateViewSet,
    SavedSearchViewSet,
)
from apps.linkedin.webhooks import unipile_webhook

router = DefaultRouter()
router.register("accounts", LinkedInAccountViewSet, basename="linkedin-accounts")
router.register("searches", SavedSearchViewSet, basename="linkedin-searches")
router.register("prospects", LinkedInProspectViewSet, basename="linkedin-prospects")
router.register("templates/invitations", InvitationTemplateViewSet, basename="linkedin-invitation-templates")
router.register("templates/messages", MessageTemplateViewSet, basename="linkedin-message-templates")

messages_list = LinkedInMessagesViewSet.as_view({"get": "conversations"})
messages_detail = LinkedInMessagesViewSet.as_view({"get": "conversation_detail"})
messages_send = LinkedInMessagesViewSet.as_view({"post": "send"})
messages_start = LinkedInMessagesViewSet.as_view({"post": "start"})
messages_mark_read = LinkedInMessagesViewSet.as_view({"post": "mark_read"})
messages_unread = LinkedInMessagesViewSet.as_view({"get": "unread_count"})

urlpatterns = [
    path("", include(router.urls)),
    path("messages/conversations/", messages_list, name="linkedin-messages-conversations"),
    path("messages/conversations/<uuid:pk>/", messages_detail, name="linkedin-messages-conversation-detail"),
    path("messages/conversations/<uuid:pk>/send/", messages_send, name="linkedin-messages-send"),
    path("messages/conversations/<uuid:pk>/start/", messages_start, name="linkedin-messages-start"),
    path("messages/mark-read/<uuid:pk>/", messages_mark_read, name="linkedin-messages-mark-read"),
    path("messages/unread-count/", messages_unread, name="linkedin-messages-unread-count"),
    path("invitations/", LinkedInInvitationsView.as_view(), name="linkedin-invitations"),
    path("invitations/stats/", LinkedInInvitationStatsView.as_view(), name="linkedin-invitations-stats"),
    path("funnel/summary/", LinkedInFunnelSummaryView.as_view(), name="linkedin-funnel-summary"),
    path("funnel/stages/<str:stage>/", LinkedInFunnelStageView.as_view(), name="linkedin-funnel-stage"),
    path("dashboard/", LinkedInDashboardView.as_view(), name="linkedin-dashboard"),
    path("webhooks/unipile/", unipile_webhook, name="linkedin-unipile-webhook"),
]

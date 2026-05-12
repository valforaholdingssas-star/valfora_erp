"""ViewSets for LinkedIn module."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from apps.chat.models import Conversation
from apps.ai_config.runtime import (
    resolve_linkedin_max_invitations_per_day,
    resolve_unipile_link_callback_url,
)
from apps.crm.models import Contact
from apps.linkedin.constants import ERROR_LINKEDIN_NOT_CONNECTED, ERROR_PROSPECT_ALREADY_EXISTS
from apps.linkedin.filters import LinkedInProspectFilter, SavedSearchFilter
from apps.linkedin.models import (
    InvitationTemplate,
    LinkedInAccount,
    LinkedInProspect,
    MessageTemplate,
    ProspectStageLog,
    SavedSearch,
)
from apps.linkedin.permissions import IsLinkedInUser
from apps.linkedin.serializers import (
    BulkIdsSerializer,
    InvitationTemplateSerializer,
    LinkCrmSerializer,
    LinkedInAccountSerializer,
    LinkedInProspectSerializer,
    MessageTemplateSerializer,
    ProspectMoveStageSerializer,
    SavedSearchSerializer,
    SendInvitationSerializer,
    SendMessageSerializer,
)
from apps.linkedin.services import UnipileService
from apps.notifications.models import Notification


def _require_account(user) -> LinkedInAccount:
    account = LinkedInAccount.objects.filter(user=user, is_active=True).first()
    if not account:
        from rest_framework.exceptions import ValidationError

        raise ValidationError({"detail": "No tienes cuenta LinkedIn conectada.", "code": ERROR_LINKEDIN_NOT_CONNECTED})
    return account


class LinkedInAccountViewSet(viewsets.GenericViewSet):
    """Manage linked account connection status."""

    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]
    serializer_class = LinkedInAccountSerializer
    service_class = UnipileService

    @action(detail=False, methods=["post"], url_path="connect")
    def connect(self, request):
        callback_url = request.data.get("callback_url") or resolve_unipile_link_callback_url()
        data = self.service_class().get_auth_link(str(request.user.id), callback_url)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="status")
    def status(self, request):
        account = LinkedInAccount.objects.filter(user=request.user, is_active=True).first()
        if not account:
            return Response({"connected": False, "account": None})
        return Response({"connected": True, "account": self.get_serializer(account).data})

    @action(detail=False, methods=["post"], url_path="disconnect")
    def disconnect(self, request):
        account = _require_account(request.user)
        self.service_class().disconnect_account(account.unipile_account_id)
        account.status = "disconnected"
        account.is_active = False
        account.save(update_fields=["status", "is_active", "updated_at"])
        return Response({"status": "ok"})

    @action(detail=False, methods=["post"], url_path="callback", permission_classes=[permissions.AllowAny])
    def callback(self, request):
        account_id = request.data.get("account_id")
        user_id = request.data.get("user_id")
        if not account_id or not user_id:
            return Response({"detail": "account_id y user_id requeridos."}, status=status.HTTP_400_BAD_REQUEST)
        account_data = self.service_class().get_account(account_id)
        account, _ = LinkedInAccount.objects.update_or_create(
            user_id=user_id,
            defaults={
                "unipile_account_id": account_id,
                "linkedin_user_id": account_data.get("provider_id", ""),
                "linkedin_name": account_data.get("name", ""),
                "linkedin_profile_url": account_data.get("profile_url", ""),
                "status": "active",
                "connected_at": timezone.now(),
                "last_sync_at": timezone.now(),
                "metadata": account_data,
            },
        )
        return Response({"status": "ok", "account_id": str(account.id)})


class SavedSearchViewSet(viewsets.ModelViewSet):
    """CRUD for saved searches."""

    serializer_class = SavedSearchSerializer
    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]
    filterset_class = SavedSearchFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("name", "keywords", "job_title", "industry", "location")
    ordering_fields = ("created_at", "updated_at", "last_executed_at")
    service_class = UnipileService

    def get_queryset(self):
        return SavedSearch.objects.filter(account__user=self.request.user, is_active=True).select_related("account")

    def perform_create(self, serializer):
        serializer.save(account=_require_account(self.request.user))

    @action(detail=True, methods=["post"], url_path="execute")
    def execute(self, request, pk=None):
        search = self.get_object()
        filters = {
            "job_title": search.job_title,
            "industry": search.industry,
            "location": search.location,
            "network_distance": search.network_distance,
        }
        payload = self.service_class().search_people(
            search.account.unipile_account_id,
            keywords=search.keywords,
            filters={k: v for k, v in filters.items() if v},
            limit=int(request.data.get("limit", 25)),
        )
        created = 0
        for item in payload.get("items", []):
            profile_id = str(item.get("profile_id") or item.get("id") or "").strip()
            if not profile_id:
                continue
            obj, was_created = LinkedInProspect.objects.get_or_create(
                account=search.account,
                linkedin_profile_id=profile_id,
                defaults={
                    "saved_search": search,
                    "linkedin_profile_url": item.get("profile_url", ""),
                    "full_name": item.get("full_name") or item.get("name") or "Perfil LinkedIn",
                    "headline": item.get("headline", ""),
                    "company_name": item.get("company_name", ""),
                    "job_title": item.get("job_title", ""),
                    "location": item.get("location", ""),
                    "profile_picture_url": item.get("profile_picture_url", ""),
                    "network_distance": item.get("network_distance", "out_of_network"),
                    "funnel_stage": "contacted",
                },
            )
            if was_created:
                created += 1
            elif obj.saved_search_id is None:
                obj.saved_search = search
                obj.save(update_fields=["saved_search", "updated_at"])
        search.last_executed_at = timezone.now()
        search.total_results_found = max(search.total_results_found + created, search.total_results_found)
        search.save(update_fields=["last_executed_at", "total_results_found", "updated_at"])
        return Response({"created": created, "total_items": len(payload.get("items", []))})

    @action(detail=True, methods=["get"], url_path="results")
    def results(self, request, pk=None):
        search = self.get_object()
        qs = LinkedInProspect.objects.filter(saved_search=search, is_active=True, is_discarded=False)
        page = self.paginate_queryset(qs)
        ser = LinkedInProspectSerializer(page, many=True)
        return self.get_paginated_response(ser.data)


class LinkedInProspectViewSet(viewsets.ModelViewSet):
    """Prospects list and funnel actions."""

    serializer_class = LinkedInProspectSerializer
    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]
    filterset_class = LinkedInProspectFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("full_name", "headline", "company_name", "job_title", "location", "linkedin_profile_id")
    ordering_fields = ("created_at", "updated_at", "last_message_at", "invitation_sent_at")
    service_class = UnipileService

    def get_queryset(self):
        return LinkedInProspect.objects.filter(account__user=self.request.user, is_active=True).select_related(
            "account",
            "saved_search",
            "crm_contact",
        )

    def perform_create(self, serializer):
        account = _require_account(self.request.user)
        profile_id = serializer.validated_data["linkedin_profile_id"]
        if LinkedInProspect.objects.filter(account=account, linkedin_profile_id=profile_id, is_active=True).exists():
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"detail": "El prospecto ya existe.", "code": ERROR_PROSPECT_ALREADY_EXISTS})
        serializer.save(account=account)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        prospect = self.get_object()
        prospect.is_discarded = False
        if prospect.funnel_stage == "discarded":
            prospect.funnel_stage = "contacted"
        prospect.save(update_fields=["is_discarded", "funnel_stage", "updated_at"])
        return Response({"status": "ok"})

    @action(detail=True, methods=["post"], url_path="discard")
    def discard(self, request, pk=None):
        prospect = self.get_object()
        old = prospect.funnel_stage
        prospect.is_discarded = True
        prospect.funnel_stage = "discarded"
        prospect.save(update_fields=["is_discarded", "funnel_stage", "updated_at"])
        ProspectStageLog.objects.create(
            prospect=prospect,
            from_stage=old,
            to_stage="discarded",
            changed_by=request.user,
            reason="Descartado por usuario",
        )
        return Response({"status": "ok"})

    @action(detail=True, methods=["post"], url_path="move-stage")
    def move_stage(self, request, pk=None):
        prospect = self.get_object()
        serializer = ProspectMoveStageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old = prospect.funnel_stage
        new = serializer.validated_data["to_stage"]
        prospect.funnel_stage = new
        prospect.save(update_fields=["funnel_stage", "updated_at"])
        ProspectStageLog.objects.create(
            prospect=prospect,
            from_stage=old,
            to_stage=new,
            changed_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        return Response({"status": "ok", "from_stage": old, "to_stage": new})

    @action(detail=True, methods=["post"], url_path="link-crm")
    def link_crm(self, request, pk=None):
        prospect = self.get_object()
        serializer = LinkCrmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contact_id = serializer.validated_data.get("contact_id")
        create_contact = serializer.validated_data.get("create_contact", False)
        if contact_id:
            contact = get_object_or_404(Contact, id=contact_id, is_active=True)
        elif create_contact:
            names = (prospect.full_name or "").strip().split(" ", 1)
            first_name = names[0] if names else "LinkedIn"
            last_name = names[1] if len(names) > 1 else "Prospect"
            contact = Contact.objects.create(
                first_name=first_name,
                last_name=last_name,
                email=f"{prospect.linkedin_profile_id}@linkedin.local",
                source="social_media",
                notes=f"Creado desde LinkedIn: {prospect.linkedin_profile_url}",
                created_by=request.user,
            )
        else:
            return Response({"detail": "Debes indicar contact_id o create_contact=true."}, status=status.HTTP_400_BAD_REQUEST)
        prospect.crm_contact = contact
        prospect.save(update_fields=["crm_contact", "updated_at"])
        return Response({"status": "ok", "crm_contact_id": str(contact.id)})

    @action(detail=False, methods=["post"], url_path="bulk-approve")
    def bulk_approve(self, request):
        serializer = BulkIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["ids"]
        updated = self.get_queryset().filter(id__in=ids).update(is_discarded=False, funnel_stage="contacted")
        return Response({"updated": updated})

    @action(detail=False, methods=["post"], url_path="bulk-discard")
    def bulk_discard(self, request):
        serializer = BulkIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["ids"]
        updated = self.get_queryset().filter(id__in=ids).update(is_discarded=True, funnel_stage="discarded")
        return Response({"updated": updated})

    @action(detail=False, methods=["get"], url_path="pending-review")
    def pending_review(self, request):
        qs = self.get_queryset().filter(is_discarded=False, invitation_status="not_sent")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(LinkedInProspectSerializer(page, many=True).data)

    @action(detail=False, methods=["get"], url_path="stale")
    def stale(self, request):
        stale_cutoff = timezone.now() - timedelta(days=3)
        qs = self.get_queryset().filter(last_message_direction="outbound", last_message_at__lte=stale_cutoff).order_by("last_message_at")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(LinkedInProspectSerializer(page, many=True).data)

    @action(detail=True, methods=["post"], url_path="invite")
    def invite(self, request, pk=None):
        prospect = self.get_object()
        serializer = SendInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = self.service_class()
        response = service.send_invitation(
            account_id=prospect.account.unipile_account_id,
            profile_id=prospect.linkedin_profile_id,
            message=serializer.validated_data.get("message"),
        )
        prospect.invitation_status = "pending"
        prospect.invitation_sent_at = timezone.now()
        if prospect.funnel_stage in {"contacted", "no_response"}:
            prospect.funnel_stage = "high_interest"
        prospect.save(update_fields=["invitation_status", "invitation_sent_at", "funnel_stage", "updated_at"])
        return Response({"status": "ok", "provider_response": response})

    @action(detail=True, methods=["post"], url_path="withdraw-invite")
    def withdraw_invite(self, request, pk=None):
        prospect = self.get_object()
        invitation_id = request.data.get("invitation_id")
        if not invitation_id:
            return Response({"detail": "invitation_id es requerido"}, status=status.HTTP_400_BAD_REQUEST)
        self.service_class().withdraw_invitation(prospect.account.unipile_account_id, invitation_id)
        prospect.invitation_status = "withdrawn"
        prospect.save(update_fields=["invitation_status", "updated_at"])
        return Response({"status": "ok"})


class InvitationTemplateViewSet(viewsets.ModelViewSet):
    """CRUD for invitation templates."""

    serializer_class = InvitationTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ("name", "body")
    ordering_fields = ("name", "created_at")

    def get_queryset(self):
        return InvitationTemplate.objects.filter(account__user=self.request.user, is_active=True).select_related("account")

    def perform_create(self, serializer):
        serializer.save(account=_require_account(self.request.user))


class MessageTemplateViewSet(viewsets.ModelViewSet):
    """CRUD for message templates."""

    serializer_class = MessageTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ("name", "body")
    ordering_fields = ("name", "created_at")

    def get_queryset(self):
        return MessageTemplate.objects.filter(account__user=self.request.user, is_active=True).select_related("account")

    def perform_create(self, serializer):
        serializer.save(account=_require_account(self.request.user))


class LinkedInMessagesViewSet(viewsets.ViewSet):
    """LinkedIn messaging endpoints."""

    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]
    service_class = UnipileService

    @action(detail=False, methods=["get"], url_path="conversations")
    def conversations(self, request):
        account = _require_account(request.user)
        prospects = LinkedInProspect.objects.filter(account=account, unipile_chat_id__gt="", is_active=True).order_by("-last_message_at")
        return Response(
            {
                "count": prospects.count(),
                "results": LinkedInProspectSerializer(prospects[:200], many=True).data,
            }
        )

    @action(detail=True, methods=["get"], url_path="conversations")
    def conversation_detail(self, request, pk=None):
        account = _require_account(request.user)
        prospect = get_object_or_404(LinkedInProspect, id=pk, account=account, is_active=True)
        if not prospect.unipile_chat_id:
            return Response({"results": [], "count": 0})
        payload = self.service_class().get_chat_messages(prospect.unipile_chat_id, limit=int(request.query_params.get("limit", 100)))
        return Response(payload)

    @action(detail=True, methods=["post"], url_path="conversations/send")
    def send(self, request, pk=None):
        account = _require_account(request.user)
        prospect = get_object_or_404(LinkedInProspect, id=pk, account=account, is_active=True)
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not prospect.unipile_chat_id:
            return Response({"detail": "No existe chat para este prospecto."}, status=status.HTTP_400_BAD_REQUEST)
        payload = self.service_class().send_message(account.unipile_account_id, prospect.unipile_chat_id, serializer.validated_data["text"])
        prospect.last_message_at = timezone.now()
        prospect.last_message_direction = "outbound"
        if prospect.funnel_stage in {"contacted", "no_response"}:
            prospect.funnel_stage = "high_interest"
        prospect.save(update_fields=["last_message_at", "last_message_direction", "funnel_stage", "updated_at"])
        return Response(payload)

    @action(detail=True, methods=["post"], url_path="conversations/start")
    def start(self, request, pk=None):
        account = _require_account(request.user)
        prospect = get_object_or_404(LinkedInProspect, id=pk, account=account, is_active=True)
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = self.service_class().start_chat(account.unipile_account_id, prospect.linkedin_profile_id, serializer.validated_data["text"])
        prospect.unipile_chat_id = payload.get("chat_id", prospect.unipile_chat_id)
        prospect.last_message_at = timezone.now()
        prospect.last_message_direction = "outbound"
        prospect.save(update_fields=["unipile_chat_id", "last_message_at", "last_message_direction", "updated_at"])
        return Response(payload)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        account = _require_account(request.user)
        prospect = get_object_or_404(LinkedInProspect, id=pk, account=account, is_active=True)
        if prospect.unipile_chat_id:
            # Best-effort sync with provider read-state (does not block local UX).
            self.service_class().mark_chat_read(account.unipile_account_id, prospect.unipile_chat_id)
        conv = Conversation.objects.filter(channel="linkedin", contact=prospect.crm_contact, is_active=True).first()
        if conv:
            conv.unread_count = 0
            conv.save(update_fields=["unread_count", "updated_at"])
        Notification.objects.filter(
            recipient=request.user,
            is_read=False,
            related_object_type="LinkedInProspect",
            related_object_id=prospect.id,
        ).update(is_read=True, updated_at=timezone.now())
        return Response({"status": "ok"})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = Notification.objects.filter(
            recipient=request.user,
            is_read=False,
            related_object_type="LinkedInProspect",
        ).count()
        return Response({"count": count})


class LinkedInDashboardView(APIView):
    """Dashboard summary for LinkedIn module."""

    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]

    def get(self, request):
        account = _require_account(request.user)
        by_stage = (
            LinkedInProspect.objects.filter(account=account, is_active=True, is_discarded=False)
            .values("funnel_stage")
            .annotate(count=Count("id"))
        )
        stale_count = (
            LinkedInProspect.objects.filter(account=account, is_active=True, last_message_direction="outbound")
            .filter(last_message_at__lte=timezone.now() - timedelta(days=3))
            .count()
        )
        week_start = datetime.now(tz=UTC).date() - timedelta(days=7)
        invitations_week = LinkedInProspect.objects.filter(
            account=account,
            is_active=True,
            invitation_sent_at__date__gte=week_start,
        ).count()
        return Response(
            {
                "funnel": list(by_stage),
                "stale_prospects": stale_count,
                "invitations_week": invitations_week,
                "active_saved_searches": SavedSearch.objects.filter(account=account, is_active=True).count(),
            }
        )


class LinkedInInvitationsView(APIView):
    """Invitation listing and stats endpoints."""

    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]

    def get(self, request):
        account = _require_account(request.user)
        qs = LinkedInProspect.objects.filter(account=account, is_active=True).exclude(invitation_status="not_sent")
        return Response(
            {
                "count": qs.count(),
                "results": LinkedInProspectSerializer(qs.order_by("-invitation_sent_at")[:200], many=True).data,
            }
        )


class LinkedInInvitationStatsView(APIView):
    """Invitation usage stats endpoint."""

    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]

    def get(self, request):
        account = _require_account(request.user)
        week_start = timezone.now().date() - timedelta(days=7)
        sent_week = LinkedInProspect.objects.filter(
            account=account,
            is_active=True,
            invitation_sent_at__date__gte=week_start,
        ).count()
        limit = int(resolve_linkedin_max_invitations_per_day())
        return Response({"sent_week": sent_week, "daily_limit": limit})


class LinkedInFunnelSummaryView(APIView):
    """Funnel summary endpoint."""

    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]

    def get(self, request):
        account = _require_account(request.user)
        summary = (
            LinkedInProspect.objects.filter(account=account, is_active=True, is_discarded=False)
            .values("funnel_stage")
            .annotate(count=Count("id"))
            .order_by("funnel_stage")
        )
        return Response({"results": list(summary)})


class LinkedInFunnelStageView(APIView):
    """List prospects by stage."""

    permission_classes = [permissions.IsAuthenticated, IsLinkedInUser]

    def get(self, request, stage: str):
        account = _require_account(request.user)
        qs = LinkedInProspect.objects.filter(account=account, is_active=True, funnel_stage=stage, is_discarded=False)
        return Response({"count": qs.count(), "results": LinkedInProspectSerializer(qs[:200], many=True).data})

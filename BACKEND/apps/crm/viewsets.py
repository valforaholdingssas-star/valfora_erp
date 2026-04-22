"""ViewSets for CRM API."""

import mimetypes
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework import serializers as drf_serializers
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.permissions import IsAdminOrSuperAdmin
from apps.common.audit import write_audit_log
from apps.crm.filters import ActivityFilter, CompanyFilter, ContactFilter, DealFilter, DocumentFilter
from apps.crm.models import (
    Activity,
    Company,
    Contact,
    Deal,
    DealStageHistory,
    Document,
    LeadEngineConfig,
    PipelineAutomationConfig,
)
from apps.crm.permissions import IsCRMUser
from apps.crm.serializers import (
    ActivitySerializer,
    BulkContactAssignSerializer,
    BulkContactStageSerializer,
    CompanySerializer,
    ContactSerializer,
    DealStageHistorySerializer,
    DealSerializer,
    DocumentSerializer,
    LeadEngineConfigSerializer,
    PipelineAutomationConfigSerializer,
)
from apps.crm.pipeline_automation import PipelineAutomationService
from apps.whatsapp.models import WhatsAppTemplate
from apps.whatsapp.tasks import send_whatsapp_template
from apps.chat.models import Message
from apps.chat.serializers import MessageSerializer
from apps.crm.services import build_contact_timeline, build_crm_dashboard


def _serialize_changes(changes: dict) -> dict:
    """Convert non-JSON values in serializer validated_data for audit logs."""
    safe = {}
    for key, value in changes.items():
        if hasattr(value, "pk"):
            safe[key] = str(value.pk)
        elif isinstance(value, (list, tuple)):
            safe[key] = [str(item.pk) if hasattr(item, "pk") else item for item in value]
        else:
            safe[key] = value
    return safe


class CRMBaseViewSet(viewsets.ModelViewSet):
    """Shared permission and audit behaviour for CRM resources."""

    permission_classes = [permissions.IsAuthenticated, IsCRMUser]

    def get_permissions(self):
        if self.action == "destroy":
            return [permissions.IsAuthenticated(), IsAdminOrSuperAdmin()]
        return [permissions.IsAuthenticated(), IsCRMUser()]

    def perform_create(self, serializer):
        instance = serializer.save()
        write_audit_log(
            user=self.request.user,
            action="create",
            instance=instance,
            changes={},
            request=self.request,
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        write_audit_log(
            user=self.request.user,
            action="update",
            instance=instance,
            changes=_serialize_changes(dict(serializer.validated_data)),
            request=self.request,
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        write_audit_log(
            user=self.request.user,
            action="delete",
            instance=instance,
            changes={"is_active": False},
            request=self.request,
        )


class CompanyViewSet(CRMBaseViewSet):
    """Companies CRUD."""

    queryset = Company.objects.filter(is_active=True).annotate(contacts_count=Count("contacts"))
    serializer_class = CompanySerializer
    filterset_class = CompanyFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("name", "industry", "city")
    ordering_fields = ("name", "created_at")


class ContactViewSet(CRMBaseViewSet):
    """Contacts CRUD + timeline."""

    queryset = Contact.objects.filter(is_active=True).select_related("company", "assigned_to", "created_by")
    serializer_class = ContactSerializer
    filterset_class = ContactFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("email", "first_name", "last_name", "phone_number")
    ordering_fields = ("created_at", "last_contact_date", "lifecycle_stage")

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        write_audit_log(
            user=self.request.user,
            action="create",
            instance=instance,
            changes={},
            request=self.request,
        )

    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        """Return activity timeline for this contact."""
        contact = self.get_object()
        data = build_contact_timeline(contact.id)
        return Response(data)

    @action(detail=True, methods=["get"], url_path="chat-history")
    def chat_history(self, request, pk=None):
        """Recent chat messages across all conversations for this contact (oldest first)."""
        contact = self.get_object()
        try:
            limit = int(request.query_params.get("limit", 100))
        except (TypeError, ValueError):
            limit = 100
        limit = max(1, min(limit, 500))
        qs = (
            Message.objects.filter(
                conversation__contact_id=contact.id,
                conversation__is_active=True,
                is_active=True,
            )
            .select_related("conversation")
            .order_by("-created_at")[:limit]
        )
        msgs = list(qs)
        msgs.reverse()
        ser = MessageSerializer(msgs, many=True, context={"request": request})
        return Response({"count": len(ser.data), "results": ser.data})

    @action(detail=False, methods=["post"], url_path="bulk-assign")
    def bulk_assign(self, request):
        """Assign many contacts to a user (or unassign when assigned_to omitted/null)."""
        ser = BulkContactAssignSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data["ids"]
        assigned_to = ser.validated_data.get("assigned_to")
        role = getattr(request.user, "role", None)
        if role == "collaborator":
            if assigned_to is not None and assigned_to.id != request.user.id:
                raise drf_serializers.ValidationError(
                    {"assigned_to": "Los colaboradores solo pueden asignarse a sí mismos."},
                )
        qs = self.get_queryset().filter(pk__in=ids)
        if qs.count() != len(set(str(i) for i in ids)):
            raise drf_serializers.ValidationError({"ids": "Algunos contactos no existen o no tienes acceso."})
        assign_id = assigned_to.id if assigned_to else None
        for contact in qs:
            contact.assigned_to_id = assign_id
            contact.save(update_fields=["assigned_to", "updated_at"])
            write_audit_log(
                user=request.user,
                action="update",
                instance=contact,
                changes={"assigned_to": str(assign_id) if assign_id else None},
                request=request,
            )
        return Response({"updated": qs.count()})

    @action(detail=False, methods=["post"], url_path="bulk-stage")
    def bulk_stage(self, request):
        """Set lifecycle_stage for many contacts."""
        ser = BulkContactStageSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data["ids"]
        stage = ser.validated_data["lifecycle_stage"]
        qs = self.get_queryset().filter(pk__in=ids)
        if qs.count() != len(set(str(i) for i in ids)):
            raise drf_serializers.ValidationError({"ids": "Algunos contactos no existen o no tienes acceso."})
        for contact in qs:
            contact.lifecycle_stage = stage
            contact.save(update_fields=["lifecycle_stage", "updated_at"])
            write_audit_log(
                user=request.user,
                action="update",
                instance=contact,
                changes={"lifecycle_stage": stage},
                request=request,
            )
        return Response({"updated": qs.count()})

    @action(detail=False, methods=["post"], url_path="bulk-reactivate")
    def bulk_reactivate(self, request):
        """Send a reactivation template to selected contacts with WhatsApp conversations."""
        ids = request.data.get("ids") or []
        template_id = request.data.get("template_id")
        variables = request.data.get("variables") or []
        if not ids or not template_id:
            raise drf_serializers.ValidationError({"detail": "ids y template_id son requeridos."})

        template = WhatsAppTemplate.objects.filter(pk=template_id, is_active=True, status="approved").first()
        if not template:
            raise drf_serializers.ValidationError({"template_id": "Template no aprobado o inexistente."})

        sent = 0
        for contact in Contact.objects.filter(pk__in=ids, is_active=True):
            conv = (
                contact.conversations.filter(channel="whatsapp", is_active=True)
                .order_by("-updated_at")
                .first()
            )
            if not conv:
                continue
            msg = Message.objects.create(
                conversation=conv,
                sender_type="user",
                sender_user=request.user,
                content=f"Template: {template.name}",
                message_type="text",
                status="pending",
                metadata={"bulk_reactivate": True, "template_id": str(template.id)},
            )
            send_whatsapp_template.delay(str(msg.id), str(template.id), variables)
            sent += 1
        return Response({"sent": sent})


class DealViewSet(CRMBaseViewSet):
    """Deals CRUD."""

    queryset = Deal.objects.filter(is_active=True).select_related("contact", "company", "assigned_to")
    serializer_class = DealSerializer
    filterset_class = DealFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("title", "description")
    ordering_fields = ("value", "expected_close_date", "stage", "updated_at")

    def perform_create(self, serializer):
        instance = serializer.save()
        if not instance.company_id and instance.contact.company_id:
            instance.company_id = instance.contact.company_id
            instance.save(update_fields=["company"])
        write_audit_log(
            user=self.request.user,
            action="create",
            instance=instance,
            changes={},
            request=self.request,
        )

    @action(detail=True, methods=["post"], url_path="move-stage")
    def move_stage(self, request, pk=None):
        """Manually move a deal stage while registering stage history."""
        deal = self.get_object()
        to_stage = request.data.get("to_stage")
        if not to_stage:
            raise drf_serializers.ValidationError({"to_stage": "Este campo es requerido."})
        result = PipelineAutomationService.move_stage(
            deal=deal,
            to_stage=to_stage,
            trigger="manual",
            moved_by=request.user,
            notes=(request.data.get("notes") or "").strip(),
        )
        if not result.moved:
            return Response({"detail": result.reason}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(deal).data)

    @action(detail=True, methods=["get"], url_path="stage-history")
    def stage_history(self, request, pk=None):
        """Deal stage movement timeline."""
        deal = self.get_object()
        qs = deal.stage_history.filter(is_active=True).order_by("-created_at")
        ser = DealStageHistorySerializer(qs, many=True)
        return Response(ser.data)


class ActivityViewSet(
    viewsets.mixins.ListModelMixin,
    viewsets.mixins.CreateModelMixin,
    viewsets.mixins.RetrieveModelMixin,
    viewsets.mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Activities: list, create, read, update, complete — no delete (contract)."""

    queryset = Activity.objects.filter(is_active=True).select_related(
        "contact", "deal", "assigned_to", "created_by"
    )
    serializer_class = ActivitySerializer
    filterset_class = ActivityFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("subject", "description")
    ordering_fields = ("created_at", "due_date")
    permission_classes = [permissions.IsAuthenticated, IsCRMUser]

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        write_audit_log(
            user=self.request.user,
            action="create",
            instance=instance,
            request=self.request,
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        write_audit_log(
            user=self.request.user,
            action="update",
            instance=instance,
            changes=dict(serializer.validated_data),
            request=self.request,
        )

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        """Mark activity as completed."""
        activity = self.get_object()
        activity.is_completed = True
        activity.completed_at = timezone.now()
        activity.save(update_fields=["is_completed", "completed_at", "updated_at"])
        write_audit_log(
            user=request.user,
            action="update",
            instance=activity,
            changes={"is_completed": True},
            request=request,
        )
        ser = self.get_serializer(activity)
        return Response(ser.data, status=status.HTTP_200_OK)


class DocumentViewSet(CRMBaseViewSet):
    """Document upload and listing."""

    queryset = Document.objects.filter(is_active=True).select_related("contact", "deal", "ai_configuration", "uploaded_by")
    serializer_class = DocumentSerializer
    filterset_class = DocumentFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ("name", "description")
    ordering_fields = ("created_at",)

    def perform_create(self, serializer):
        upload = serializer.validated_data.get("file")
        name = serializer.validated_data.get("name") or (getattr(upload, "name", None) if upload else "")
        ft = ""
        size = 0
        if upload:
            size = getattr(upload, "size", 0) or 0
            ft = getattr(upload, "content_type", None) or (
                mimetypes.guess_type(getattr(upload, "name", "") or "")[0] or ""
            )
        instance = serializer.save(
            uploaded_by=self.request.user,
            name=name or "file",
            file_size=size,
            file_type=ft,
        )
        write_audit_log(
            user=self.request.user,
            action="create",
            instance=instance,
            request=self.request,
        )

    def perform_destroy(self, instance):
        """Soft-delete metadata and remove file from storage."""
        path = instance.file.name if instance.file else ""
        storage = instance.file.storage if instance.file else None
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        write_audit_log(
            user=self.request.user,
            action="delete",
            instance=instance,
            changes={"is_active": False},
            request=self.request,
        )
        if storage and path:
            try:
                storage.delete(path)
            except OSError:
                pass


class CRMDashboardView(APIView):
    """Aggregated CRM metrics."""

    permission_classes = [permissions.IsAuthenticated, IsCRMUser]

    def get(self, request):
        return Response(build_crm_dashboard())


class LeadEngineConfigView(APIView):
    """Read/update lead engine configuration."""

    permission_classes = [permissions.IsAuthenticated, IsAdminOrSuperAdmin]

    def get_object(self) -> LeadEngineConfig:
        cfg = LeadEngineConfig.objects.filter(is_active=True).order_by("-updated_at").first()
        if cfg:
            return cfg
        return LeadEngineConfig.objects.create()

    def get(self, request):
        ser = LeadEngineConfigSerializer(self.get_object())
        return Response(ser.data)

    def patch(self, request):
        obj = self.get_object()
        ser = LeadEngineConfigSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        write_audit_log(
            user=request.user,
            action="update",
            instance=obj,
            changes=_serialize_changes(dict(ser.validated_data)),
            request=request,
        )
        return Response(LeadEngineConfigSerializer(obj).data)


class PipelineAutomationConfigView(APIView):
    """Read/update pipeline automation configuration."""

    permission_classes = [permissions.IsAuthenticated, IsAdminOrSuperAdmin]

    def get_object(self) -> PipelineAutomationConfig:
        cfg = PipelineAutomationConfig.objects.filter(is_active=True).order_by("-updated_at").first()
        if cfg:
            return cfg
        return PipelineAutomationConfig.objects.create()

    def get(self, request):
        ser = PipelineAutomationConfigSerializer(self.get_object())
        return Response(ser.data)

    def patch(self, request):
        obj = self.get_object()
        ser = PipelineAutomationConfigSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        write_audit_log(
            user=request.user,
            action="update",
            instance=obj,
            changes=_serialize_changes(dict(ser.validated_data)),
            request=request,
        )
        return Response(PipelineAutomationConfigSerializer(obj).data)


class LeadEngineDashboardView(APIView):
    """Automation metrics dashboard for lead engine settings section."""

    permission_classes = [permissions.IsAuthenticated, IsAdminOrSuperAdmin]

    def get(self, request):
        now = timezone.now()
        since = now - timedelta(days=30)
        auto_contacts = Contact.objects.filter(is_active=True, source="whatsapp", created_at__gte=since).count()
        total_contacts = Contact.objects.filter(is_active=True, created_at__gte=since).count()
        auto_deal_moves = DealStageHistory.objects.filter(is_active=True, moved_by__isnull=True, created_at__gte=since).count()
        manual_deal_moves = DealStageHistory.objects.filter(is_active=True, moved_by__isnull=False, created_at__gte=since).count()
        stale_deals = Deal.objects.filter(is_active=True, is_stale=True).count()
        assignment_distribution = (
            Contact.objects.filter(is_active=True, source="whatsapp", created_at__gte=since)
            .values("assigned_to__email")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        funnel = (
            Deal.objects.filter(is_active=True)
            .values("stage")
            .annotate(count=Count("id"))
            .order_by("stage")
        )
        return Response(
            {
                "kpis": {
                    "auto_leads": auto_contacts,
                    "manual_leads": max(total_contacts - auto_contacts, 0),
                    "auto_deal_moves": auto_deal_moves,
                    "manual_deal_moves": manual_deal_moves,
                    "stale_deals": stale_deals,
                },
                "assignment_distribution": list(assignment_distribution),
                "conversion_funnel": list(funnel),
                "generated_at": now.isoformat(),
            }
        )

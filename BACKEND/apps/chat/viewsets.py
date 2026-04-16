"""ViewSets for chat API."""

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminOrSuperAdmin
from apps.ai_config.runtime import get_or_create_runtime_settings, resolve_global_ai_mode_enabled
from apps.common.audit import write_audit_log
from apps.chat.models import Conversation, Message, MessageAttachment
from apps.chat.permissions import IsChatUser
from apps.chat.serializers import (
    ConversationCreateSerializer,
    ConversationSerializer,
    MessageCreateSerializer,
    MessageSerializer,
    TemplateMessageSerializer,
)
from apps.whatsapp.models import WhatsAppTemplate
from apps.whatsapp.tasks import send_whatsapp_message, send_whatsapp_template

WHATSAPP_IMAGE_MAX_BYTES = int(getattr(settings, "WHATSAPP_IMAGE_MAX_BYTES", 5 * 1024 * 1024))
WHATSAPP_DOCUMENT_MAX_BYTES = int(getattr(settings, "WHATSAPP_DOCUMENT_MAX_BYTES", 100 * 1024 * 1024))
ALLOWED_WHATSAPP_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
}
ALLOWED_WHATSAPP_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/zip",
}


class ConversationViewSet(viewsets.ModelViewSet):
    """Conversations CRUD and nested messages."""

    queryset = Conversation.objects.filter(is_active=True).select_related(
        "contact",
        "deal",
        "assigned_to",
        "ai_configuration",
    )
    permission_classes = [permissions.IsAuthenticated, IsChatUser]
    filterset_fields = ("channel", "status", "contact", "assigned_to", "ai_configuration")
    search_fields = ("contact__email", "contact__first_name", "contact__last_name")
    ordering_fields = ("last_message_at", "created_at")

    def get_queryset(self):
        qs = super().get_queryset().filter(deal__isnull=False)
        params = self.request.query_params

        stage = params.get("deal_stage")
        if stage:
            qs = qs.filter(deal__stage=stage, deal__is_active=True)

        deal_opened_from = params.get("deal_opened_from")
        if deal_opened_from:
            start = parse_date(deal_opened_from)
            if start:
                qs = qs.filter(deal__created_at__date__gte=start, deal__is_active=True)

        deal_opened_to = params.get("deal_opened_to")
        if deal_opened_to:
            end = parse_date(deal_opened_to)
            if end:
                qs = qs.filter(deal__created_at__date__lte=end, deal__is_active=True)

        responsible = params.get("responsible")
        if responsible:
            qs = qs.filter(
                Q(assigned_to_id=responsible)
                | Q(contact__assigned_to_id=responsible)
                | Q(deal__assigned_to_id=responsible, deal__is_active=True)
            )

        text = params.get("search_text") or params.get("search")
        if text:
            text = text.strip()
            qs = qs.filter(
                Q(contact__first_name__icontains=text)
                | Q(contact__last_name__icontains=text)
                | Q(contact__email__icontains=text)
                | Q(contact__phone_number__icontains=text)
                | Q(contact__whatsapp_number__icontains=text)
                | Q(deal__title__icontains=text)
                | Q(messages__content__icontains=text)
            )

        return qs.distinct()

    def get_permissions(self):
        if self.action == "destroy":
            return [permissions.IsAuthenticated(), IsAdminOrSuperAdmin()]
        return [permissions.IsAuthenticated(), IsChatUser()]

    def get_serializer_class(self):
        if self.action == "create":
            return ConversationCreateSerializer
        return ConversationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        deal = serializer.validated_data.get("deal")
        contact = serializer.validated_data["contact"]
        if not deal and contact:
            deal = (
                contact.deals.filter(is_active=True)
                .exclude(stage__in=["closed_won", "closed_lost"])
                .order_by("-updated_at", "-created_at")
                .first()
            ) or contact.deals.filter(is_active=True).order_by("-updated_at", "-created_at").first()
        if not deal:
            return Response(
                {"detail": "Este chat requiere un deal asociado. Crea o selecciona un deal primero."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        channel = serializer.validated_data["channel"]
        assigned_to = serializer.validated_data.get("assigned_to") or contact.assigned_to
        ai_cfg = serializer.validated_data.get("ai_configuration")
        defaults = {
            "contact": contact,
            "assigned_to": assigned_to,
            "status": serializer.validated_data.get("status", "active"),
            "is_active": True,
            "ai_configuration": ai_cfg,
            "deal": deal,
            "ai_mode_enabled": resolve_global_ai_mode_enabled(),
        }
        if deal:
            conv, created = Conversation.objects.update_or_create(
                deal=deal,
                channel=channel,
                defaults=defaults,
            )
        else:
            existing = (
                Conversation.objects.filter(contact=contact, channel=channel, is_active=True)
                .order_by("-updated_at", "-created_at")
                .first()
            )
            if existing:
                for key, value in defaults.items():
                    setattr(existing, key, value)
                existing.save()
                conv, created = existing, False
            else:
                conv = Conversation.objects.create(channel=channel, **defaults)
                created = True
        out = ConversationSerializer(conv, context={"request": request})
        write_audit_log(
            user=request.user,
            action="create" if created else "update",
            instance=conv,
            changes={"contact": str(contact.id), "deal": str(deal.id) if deal else None, "channel": channel},
            request=request,
        )
        return Response(out.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

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

    @action(detail=True, methods=["get", "post"], url_path="messages")
    def messages(self, request, pk=None):
        """List or create messages in a conversation."""
        conv = self.get_object()
        if request.method == "GET":
            qs = Message.objects.filter(conversation=conv, is_active=True).order_by("created_at")
            page = self.paginate_queryset(qs)
            ser = MessageSerializer(page, many=True, context={"request": request})
            return self.get_paginated_response(ser.data)
        ser = MessageCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        uploaded_file = request.FILES.get("file")
        text_content = (ser.validated_data.get("content") or "").strip()
        if not text_content and not uploaded_file:
            return Response({"detail": "Debes escribir un mensaje o adjuntar un archivo."}, status=status.HTTP_400_BAD_REQUEST)

        message_type = ser.validated_data.get("message_type", "text")
        if uploaded_file and message_type == "text":
            message_type = "image" if (uploaded_file.content_type or "").startswith("image/") else "document"
        if uploaded_file:
            validation_error = self._validate_attachment_for_channel(
                channel=conv.channel,
                uploaded_file=uploaded_file,
                message_type=message_type,
            )
            if validation_error:
                return Response({"detail": validation_error}, status=status.HTTP_400_BAD_REQUEST)

        msg = Message.objects.create(
            conversation=conv,
            sender_type="user",
            sender_user=request.user,
            content=text_content,
            message_type=message_type,
            status="pending" if conv.channel == "whatsapp" else "sent",
        )
        if uploaded_file:
            MessageAttachment.objects.create(
                message=msg,
                file=uploaded_file,
                file_name=uploaded_file.name,
                file_type=uploaded_file.content_type or "application/octet-stream",
                file_size=getattr(uploaded_file, "size", 0) or 0,
            )
        if conv.channel == "whatsapp":
            window_open = (
                conv.customer_service_window_expires is not None
                and conv.customer_service_window_expires > timezone.now()
            )
            if not window_open:
                msg.status = "failed"
                msg.metadata = {
                    **(msg.metadata or {}),
                    "error": "WHATSAPP_WINDOW_CLOSED",
                    "detail": "Ventana de 24h cerrada. Usa una plantilla aprobada.",
                }
                msg.save(update_fields=["status", "metadata", "updated_at"])
                out = MessageSerializer(msg, context={"request": request})
                return Response(
                    out.data,
                    status=status.HTTP_400_BAD_REQUEST,
                )
            send_whatsapp_message.delay(str(msg.id))
        else:
            msg.status = "sent"
            msg.save(update_fields=["status", "updated_at"])
        write_audit_log(
            user=request.user,
            action="create",
            instance=msg,
            changes={"conversation": str(conv.id)},
            request=request,
        )
        out = MessageSerializer(msg, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def _validate_attachment_for_channel(self, *, channel: str, uploaded_file, message_type: str) -> str | None:
        """Validate attachment constraints, with stricter rules for WhatsApp."""
        content_type = (uploaded_file.content_type or "").lower()
        file_size = int(getattr(uploaded_file, "size", 0) or 0)
        if channel != "whatsapp":
            # Keep generic safeguards for non-whatsapp channels.
            if file_size > WHATSAPP_DOCUMENT_MAX_BYTES:
                return "El archivo supera el tamaño máximo permitido (100 MB)."
            return None

        if message_type == "image":
            if content_type not in ALLOWED_WHATSAPP_IMAGE_MIME_TYPES:
                return "WhatsApp solo permite imágenes JPG o PNG."
            if file_size > WHATSAPP_IMAGE_MAX_BYTES:
                return "La imagen supera el límite de WhatsApp (5 MB)."
            return None

        if message_type == "document":
            if content_type not in ALLOWED_WHATSAPP_DOCUMENT_MIME_TYPES:
                return "Tipo de documento no permitido para WhatsApp."
            if file_size > WHATSAPP_DOCUMENT_MAX_BYTES:
                return "El documento supera el límite de WhatsApp (100 MB)."
            return None

        return "Tipo de archivo no soportado en esta conversación."

    @action(detail=True, methods=["post"], url_path="send-template")
    def send_template(self, request, pk=None):
        """Send a template message on this conversation (WhatsApp only)."""

        conv = self.get_object()
        if conv.channel != "whatsapp":
            return Response(
                {"detail": "Esta conversación no es de WhatsApp."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = TemplateMessageSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        template = WhatsAppTemplate.objects.filter(
            pk=ser.validated_data["template_id"],
            is_active=True,
            status="approved",
        ).first()
        if not template:
            return Response(
                {"detail": "Template no encontrado o no aprobado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        msg = Message.objects.create(
            conversation=conv,
            sender_type="user",
            sender_user=request.user,
            content=f"Template: {template.name}",
            message_type="text",
            status="pending",
            metadata={
                "template_id": str(template.id),
                "template_name": template.name,
                "template_variables": ser.validated_data.get("variables", []),
            },
        )
        send_whatsapp_template.delay(
            str(msg.id),
            str(template.id),
            ser.validated_data.get("variables", []),
        )
        out = MessageSerializer(msg, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="toggle-ai")
    def toggle_ai(self, request, pk=None):
        """Toggle AI mode for this conversation (LLM wiring in phase 4)."""
        conv = self.get_object()
        conv.ai_mode_enabled = not conv.ai_mode_enabled
        conv.save(update_fields=["ai_mode_enabled", "updated_at"])
        write_audit_log(
            user=request.user,
            action="update",
            instance=conv,
            changes={"ai_mode_enabled": conv.ai_mode_enabled},
            request=request,
        )
        return Response(ConversationSerializer(conv, context={"request": request}).data)

    @action(detail=False, methods=["get", "post"], url_path="ai-mode-global")
    def ai_mode_global(self, request):
        """Read/update AI mode globally for all active conversations."""
        settings_row = get_or_create_runtime_settings()
        if request.method == "GET":
            return Response({"enabled": bool(settings_row.global_ai_mode_enabled)})

        if getattr(request.user, "role", None) not in {"admin", "super_admin"}:
            return Response({"detail": "No autorizado para cambiar el modo IA global."}, status=status.HTTP_403_FORBIDDEN)

        enabled = bool(request.data.get("enabled", False))
        updated = Conversation.objects.filter(is_active=True).update(
            ai_mode_enabled=enabled,
            updated_at=timezone.now(),
        )
        settings_row.global_ai_mode_enabled = enabled
        settings_row.save(update_fields=["global_ai_mode_enabled", "updated_at"])
        write_audit_log(
            user=request.user,
            action="update",
            instance=settings_row,
            changes={"global_ai_mode_enabled": enabled, "conversations_updated": int(updated)},
            request=request,
        )
        return Response({"enabled": enabled, "updated": int(updated)})

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        """Reset unread counter for the current user."""
        conv = self.get_object()
        conv.unread_count = 0
        conv.save(update_fields=["unread_count", "updated_at"])
        return Response(ConversationSerializer(conv, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="clear-handoff")
    def clear_handoff(self, request, pk=None):
        """Clear human-handoff flag after an agent takes the thread."""
        conv = self.get_object()
        conv.human_handoff_requested = False
        conv.human_handoff_at = None
        conv.save(update_fields=["human_handoff_requested", "human_handoff_at", "updated_at"])
        write_audit_log(
            user=request.user,
            action="update",
            instance=conv,
            changes={"human_handoff_requested": False},
            request=request,
        )
        return Response(ConversationSerializer(conv, context={"request": request}).data)

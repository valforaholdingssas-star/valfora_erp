"""ViewSets for WhatsApp admin features."""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.chat.models import Conversation, Message
from apps.whatsapp.filters import (
    WhatsAppBusinessAccountFilter,
    WhatsAppPhoneNumberFilter,
    WhatsAppTemplateFilter,
)
from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber, WhatsAppTemplate
from apps.whatsapp.permissions import IsSuperAdminOnly, IsWhatsAppAdmin
from apps.whatsapp.serializers import (
    WhatsAppBusinessAccountSerializer,
    WhatsAppPhoneNumberSerializer,
    WhatsAppTemplateSerializer,
)
from apps.whatsapp.services.whatsapp_api_service import WhatsAppAPIService
from apps.whatsapp.tasks import sync_whatsapp_phone_numbers, sync_whatsapp_templates


class WhatsAppBusinessAccountViewSet(viewsets.ModelViewSet):
    queryset = WhatsAppBusinessAccount.objects.filter(is_active=True)
    serializer_class = WhatsAppBusinessAccountSerializer
    permission_classes = [permissions.IsAuthenticated, IsSuperAdminOnly]
    filterset_class = WhatsAppBusinessAccountFilter
    search_fields = ("name", "waba_id")

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["post"], url_path="verify")
    def verify(self, request, pk=None):
        account = self.get_object()
        phone = account.phone_numbers.filter(is_active=True).order_by("-is_default", "display_phone_number").first()
        if not phone:
            return Response({"ok": False, "detail": "No hay números activos"}, status=status.HTTP_400_BAD_REQUEST)
        service = WhatsAppAPIService(phone)
        try:
            profile = service.get_business_profile()
        except Exception as exc:  # noqa: BLE001
            return Response({"ok": False, "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"ok": True, "profile": profile})

    @action(detail=True, methods=["get"], url_path="phone-numbers")
    def phone_numbers(self, request, pk=None):
        account = self.get_object()
        qs = account.phone_numbers.filter(is_active=True)
        serializer = WhatsAppPhoneNumberSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="phone-numbers/sync")
    def sync_phone_numbers(self, request, pk=None):
        account = self.get_object()
        task = sync_whatsapp_phone_numbers.delay(str(account.id))
        return Response({"queued": True, "task_id": task.id})


class WhatsAppPhoneNumberViewSet(viewsets.ModelViewSet):
    queryset = WhatsAppPhoneNumber.objects.filter(is_active=True).select_related("account")
    serializer_class = WhatsAppPhoneNumberSerializer
    permission_classes = [permissions.IsAuthenticated, IsWhatsAppAdmin]
    filterset_class = WhatsAppPhoneNumberFilter
    search_fields = ("display_phone_number", "verified_name", "phone_number_id")

    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.is_default:
            WhatsAppPhoneNumber.objects.filter(account=instance.account).exclude(pk=instance.pk).update(is_default=False)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])


class WhatsAppTemplateViewSet(viewsets.ModelViewSet):
    queryset = WhatsAppTemplate.objects.filter(is_active=True).select_related("account")
    serializer_class = WhatsAppTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsWhatsAppAdmin]
    filterset_class = WhatsAppTemplateFilter
    search_fields = ("name", "meta_template_id", "body_text")

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=False, methods=["post"], url_path="sync")
    def sync(self, request):
        account_id = request.data.get("account_id")
        task = sync_whatsapp_templates.delay(account_id)
        return Response({"queued": True, "task_id": task.id})

    @action(detail=False, methods=["get"], url_path="approved")
    def approved(self, request):
        qs = self.filter_queryset(self.get_queryset().filter(status="approved"))
        page = self.paginate_queryset(qs)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        template = self.get_object()
        phone = template.account.phone_numbers.filter(is_active=True).order_by("-is_default").first()
        if not phone:
            return Response({"detail": "No hay número activo para enviar a Meta"}, status=status.HTTP_400_BAD_REQUEST)
        service = WhatsAppAPIService(phone)
        payload = {
            "name": template.name,
            "category": template.category.upper(),
            "language": template.language,
            "components": [
                {"type": "BODY", "text": template.body_text},
            ],
        }
        if template.footer_text:
            payload["components"].append({"type": "FOOTER", "text": template.footer_text})
        try:
            response = service.create_template(payload)
        except Exception as exc:  # noqa: BLE001
            template.status = "rejected"
            template.rejection_reason = str(exc)
            template.save(update_fields=["status", "rejection_reason", "updated_at"])
            return Response({"ok": False, "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        template.meta_template_id = response.get("id", template.meta_template_id)
        template.status = "pending"
        template.rejection_reason = ""
        template.last_synced_at = timezone.now()
        template.save(update_fields=["meta_template_id", "status", "rejection_reason", "last_synced_at", "updated_at"])
        return Response({"ok": True, "response": response})


class WhatsAppBusinessProfileViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated, IsWhatsAppAdmin]

    def _default_phone(self):
        return WhatsAppPhoneNumber.objects.filter(is_active=True).order_by("-is_default", "display_phone_number").first()

    def list(self, request):
        phone = self._default_phone()
        if not phone:
            return Response({"detail": "No hay número configurado"}, status=status.HTTP_400_BAD_REQUEST)
        service = WhatsAppAPIService(phone)
        return Response(service.get_business_profile())

    def partial_update(self, request, pk=None):
        del pk
        phone = self._default_phone()
        if not phone:
            return Response({"detail": "No hay número configurado"}, status=status.HTTP_400_BAD_REQUEST)
        service = WhatsAppAPIService(phone)
        return Response(service.update_business_profile(request.data))


class WhatsAppAnalyticsViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated, IsWhatsAppAdmin]

    def list(self, request):
        now = timezone.now()
        start = now - timedelta(days=30)
        base = Message.objects.filter(conversation__channel="whatsapp", created_at__gte=start, is_active=True)
        sent = base.filter(sender_type__in=["user", "ai_bot"]).count()
        received = base.filter(sender_type="contact").count()
        delivered = base.filter(status__in=["delivered", "read"]).count()
        read = base.filter(status="read").count()

        active_conversations = (
            Message.objects.filter(conversation__channel="whatsapp", created_at__gte=start)
            .values("conversation_id")
            .distinct()
            .count()
        )
        templates_usage = (
            base.filter(metadata__has_key="template_id")
            .values("metadata__template_id")
            .annotate(total=Count("id"))
            .order_by("-total")[:10]
        )

        return Response(
            {
                "messages_sent": sent,
                "messages_received": received,
                "delivery_rate": round((delivered / sent) * 100, 2) if sent else 0,
                "read_rate": round((read / delivered) * 100, 2) if delivered else 0,
                "active_conversations": active_conversations,
                "templates_usage": list(templates_usage),
                "window_open_conversations": Conversation.objects.filter(
                    channel="whatsapp",
                    customer_service_window_expires__isnull=False,
                    customer_service_window_expires__gt=now,
                ).count(),
                "window_closed_conversations": Conversation.objects.filter(
                    channel="whatsapp",
                ).filter(
                    Q(customer_service_window_expires__isnull=True)
                    | Q(customer_service_window_expires__lte=now)
                ).count(),
            }
        )

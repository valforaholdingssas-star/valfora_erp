"""Vistas HTTP compartidas (health, utilidades)."""

from datetime import datetime, time

from django.core.cache import cache
from django.db import connection
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import HasUsersModulePermission, IsAdminOrSuperAdmin
from apps.common.models import AuditLog
from apps.common.pagination import StandardPageNumberPagination
from apps.common.serializers import AuditLogSerializer


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([])
def health_check(request):
    """
    Comprueba que la aplicación y la base de datos responden.
    Usado por balanceadores y orquestadores (contrato: GET /api/v1/health/).
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        return Response(
            {
                "status": "error",
                "message": "Base de datos no disponible.",
                "errors": {},
                "code": "SERVICE_UNAVAILABLE",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    payload = {
        "status": "success",
        "data": {"database": "ok"},
        "message": "",
    }
    return Response(payload, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def platform_dashboard(request):
    """
    Resumen para el panel principal (FASE 5): métricas ligeras con caché corta.
    """
    user = request.user
    cache_key = f"platform_dashboard:{user.id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(
            {"status": "success", "data": cached, "message": ""},
            status=status.HTTP_200_OK,
        )

    from apps.chat.models import Conversation
    from apps.crm.models import Contact, Deal
    from apps.notifications.models import Notification

    contacts_qs = Contact.objects.filter(is_active=True)
    deals_qs = Deal.objects.filter(is_active=True)
    conv_qs = Conversation.objects.filter(is_active=True)

    if getattr(user, "role", None) == "collaborator":
        contacts_qs = contacts_qs.filter(
            Q(assigned_to=user) | Q(created_by=user),
        )
        deals_qs = deals_qs.filter(assigned_to=user)
        conv_qs = conv_qs.filter(
            Q(assigned_to=user) | Q(contact__assigned_to=user),
        )

    data = {
        "contacts_total": contacts_qs.count(),
        "deals_open": deals_qs.exclude(
            stage__in=("closed_won", "closed_lost"),
        ).count(),
        "conversations_active": conv_qs.filter(status="active").count(),
        "notifications_unread": Notification.objects.filter(
            recipient=user,
            is_active=True,
            is_read=False,
        ).count(),
    }
    cache.set(cache_key, data, timeout=60)
    return Response(
        {"status": "success", "data": data, "message": ""},
        status=status.HTTP_200_OK,
    )


class ActivityLogListView(ListAPIView):
    """
    Activity log endpoint for administrators.

    Filters:
    - user: user UUID
    - action: create|update|delete|login|logout|export
    - model_name: exact model name
    - search: email/name/model/ip
    - date_from / date_to: YYYY-MM-DD
    """

    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrSuperAdmin, HasUsersModulePermission]
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        params = self.request.query_params
        qs = AuditLog.objects.select_related("user").all().order_by("-created_at")

        user_id = params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)

        action = params.get("action")
        if action:
            qs = qs.filter(action=action)

        model_name = params.get("model_name")
        if model_name:
            qs = qs.filter(model_name=model_name)

        date_from = params.get("date_from")
        if date_from:
            parsed = _parse_ymd(date_from)
            if parsed:
                qs = qs.filter(created_at__gte=timezone.make_aware(datetime.combine(parsed, time.min)))

        date_to = params.get("date_to")
        if date_to:
            parsed = _parse_ymd(date_to)
            if parsed:
                qs = qs.filter(created_at__lte=timezone.make_aware(datetime.combine(parsed, time.max)))

        term = (params.get("search") or "").strip()
        if term:
            qs = qs.filter(
                Q(user__email__icontains=term)
                | Q(user__first_name__icontains=term)
                | Q(user__last_name__icontains=term)
                | Q(model_name__icontains=term)
                | Q(ip_address__icontains=term)
            )
        return qs


def _parse_ymd(raw: str):
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None

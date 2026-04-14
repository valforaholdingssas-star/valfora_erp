"""Vistas HTTP compartidas (health, utilidades)."""

from django.core.cache import cache
from django.db import connection
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response


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

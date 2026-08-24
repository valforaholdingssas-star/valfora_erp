"""Public lead ingest API view."""

from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.crm.lead_engine import LeadEngine
from apps.crm.lead_ingest_auth import LeadIngestApiKeyPermission
from apps.crm.serializers import PublicLeadIngestResponseSerializer, PublicLeadIngestSerializer


class LeadIngestRateThrottle(SimpleRateThrottle):
    """Rate limit public lead ingest submissions by client IP."""

    scope = "lead_ingest"

    def get_cache_key(self, request, view):  # noqa: ANN001
        if request.user and request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class PublicLeadIngestView(APIView):
    """Accept lead submissions from external web forms."""

    authentication_classes: list = []
    permission_classes = [permissions.AllowAny, LeadIngestApiKeyPermission]
    throttle_classes = [LeadIngestRateThrottle]

    def post(self, request):
        serializer = PublicLeadIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        engine = LeadEngine()
        result = engine.process_public_form_lead(
            email=payload["email"],
            first_name=payload["first_name"],
            last_name=payload["last_name"],
            phone_number=payload.get("phone_number", ""),
            message=payload.get("message", ""),
            source=payload.get("source", "website"),
            company_name=payload.get("company_name", ""),
            deal_title=payload.get("deal_title", ""),
            create_deal=payload.get("create_deal"),
            external_id=payload.get("external_id", ""),
            custom_fields=payload.get("custom_fields") or {},
            intent_level=payload.get("intent_level", ""),
        )

        contact = result["contact"]
        deal = result["deal"]
        response_payload = {
            "contact_id": contact.id,
            "deal_id": deal.id if deal else None,
            "is_new_contact": result["is_new_contact"],
            "is_new_deal": result["is_new_deal"],
            "contact_name": str(contact),
            "deal_title": deal.title if deal else "",
        }
        out = PublicLeadIngestResponseSerializer(response_payload).data
        http_status = (
            status.HTTP_201_CREATED
            if result["is_new_contact"] or result["is_new_deal"]
            else status.HTTP_200_OK
        )
        return Response(
            {"message": "Lead registrado correctamente.", **out},
            status=http_status,
        )

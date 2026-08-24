"""URL routes for CRM API."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.crm.views_lead_ingest import PublicLeadIngestView
from apps.crm.viewsets import (
    ActivityViewSet,
    CompanyViewSet,
    ContactViewSet,
    CRMDashboardView,
    DealCallViewSet,
    DealViewSet,
    DocumentViewSet,
    PipelineStageViewSet,
)

router = DefaultRouter()
router.register("contacts", ContactViewSet, basename="crm-contact")
router.register("companies", CompanyViewSet, basename="crm-company")
router.register("pipeline-stages", PipelineStageViewSet, basename="crm-pipeline-stage")
router.register("deals", DealViewSet, basename="crm-deal")
router.register("deal-calls", DealCallViewSet, basename="crm-deal-call")
router.register("activities", ActivityViewSet, basename="crm-activity")
router.register("documents", DocumentViewSet, basename="crm-document")

urlpatterns = [
    path("leads/ingest/", PublicLeadIngestView.as_view(), name="crm-lead-ingest"),
    path("dashboard/", CRMDashboardView.as_view(), name="crm-dashboard"),
    path("", include(router.urls)),
]

"""URL routes for CRM API."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.crm.viewsets import (
    ActivityViewSet,
    CompanyViewSet,
    ContactViewSet,
    CRMDashboardView,
    DealViewSet,
    DocumentViewSet,
)

router = DefaultRouter()
router.register("contacts", ContactViewSet, basename="crm-contact")
router.register("companies", CompanyViewSet, basename="crm-company")
router.register("deals", DealViewSet, basename="crm-deal")
router.register("activities", ActivityViewSet, basename="crm-activity")
router.register("documents", DocumentViewSet, basename="crm-document")

urlpatterns = [
    path("dashboard/", CRMDashboardView.as_view(), name="crm-dashboard"),
    path("", include(router.urls)),
]

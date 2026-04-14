"""URL routes for finance app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.finance.views import AgingReportView, FinanceDashboardView, ReceivablesView
from apps.finance.viewsets import ContractViewSet, InvoiceViewSet, PaymentViewSet

router = DefaultRouter()
router.register("contracts", ContractViewSet, basename="finance-contract")
router.register("invoices", InvoiceViewSet, basename="finance-invoice")
router.register("payments", PaymentViewSet, basename="finance-payment")

urlpatterns = [
    path("", include(router.urls)),
    path("receivables/", ReceivablesView.as_view(), name="finance-receivables"),
    path("receivables/aging-report/", AgingReportView.as_view(), name="finance-aging-report"),
    path("dashboard/", FinanceDashboardView.as_view(), name="finance-dashboard"),
]

"""URL routes for finance app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.finance.views import (
    AgingReportView,
    CashFlowView,
    FinanceDashboardView,
    PortfolioByClientView,
    ReceivablesView,
)
from apps.finance.viewsets import ContractDocumentViewSet, ContractViewSet, InvoiceViewSet, PaymentViewSet

router = DefaultRouter()
router.register("contracts", ContractViewSet, basename="finance-contract")
router.register("contract-documents", ContractDocumentViewSet, basename="finance-contract-document")
router.register("invoices", InvoiceViewSet, basename="finance-invoice")
router.register("payments", PaymentViewSet, basename="finance-payment")

urlpatterns = [
    path("", include(router.urls)),
    path("receivables/", ReceivablesView.as_view(), name="finance-receivables"),
    path("receivables/aging-report/", AgingReportView.as_view(), name="finance-aging-report"),
    path("portfolio/", PortfolioByClientView.as_view(), name="finance-portfolio"),
    path("cash-flow/", CashFlowView.as_view(), name="finance-cash-flow"),
    path("dashboard/", FinanceDashboardView.as_view(), name="finance-dashboard"),
]

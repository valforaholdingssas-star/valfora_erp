"""ViewSets for finance resources."""

from rest_framework import permissions, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter
from django_filters.rest_framework import DjangoFilterBackend

from apps.common.audit import write_audit_log
from apps.finance.filters import ContractFilter, InvoiceFilter, PaymentFilter
from apps.finance.models import Contract, Invoice, Payment
from apps.finance.permissions import IsFinanceWriteAdmin
from apps.finance.serializers import ContractSerializer, InvoiceSerializer, PaymentSerializer
from apps.finance.services import (
    compute_invoice_amounts,
    next_contract_number,
    next_invoice_number,
    next_payment_number,
)


class FinanceBaseViewSet(viewsets.ModelViewSet):
    """Shared permissions and soft-delete."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

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


class ContractViewSet(FinanceBaseViewSet):
    queryset = Contract.objects.filter(is_active=True).select_related("contact", "company", "deal", "assigned_to")
    serializer_class = ContractSerializer
    filterset_class = ContractFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("contract_number", "title", "contact__email")
    ordering_fields = ("created_at", "start_date", "total_value")

    def perform_create(self, serializer):
        instance = serializer.save(
            contract_number=next_contract_number(),
            created_by=self.request.user,
        )
        write_audit_log(user=self.request.user, action="create", instance=instance, request=self.request)


class InvoiceViewSet(FinanceBaseViewSet):
    queryset = Invoice.objects.filter(is_active=True).select_related("contact", "company", "contract", "assigned_to")
    serializer_class = InvoiceSerializer
    filterset_class = InvoiceFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("invoice_number", "contact__email")
    ordering_fields = ("created_at", "issue_date", "due_date", "total_amount")

    def perform_create(self, serializer):
        instance = serializer.save(
            invoice_number=next_invoice_number(),
            created_by=self.request.user,
        )
        compute_invoice_amounts(instance)
        write_audit_log(user=self.request.user, action="create", instance=instance, request=self.request)

    def perform_update(self, serializer):
        instance = serializer.save()
        compute_invoice_amounts(instance)
        write_audit_log(
            user=self.request.user,
            action="update",
            instance=instance,
            changes=dict(serializer.validated_data),
            request=self.request,
        )


class PaymentViewSet(FinanceBaseViewSet):
    queryset = Payment.objects.filter(is_active=True).select_related("invoice", "recorded_by")
    serializer_class = PaymentSerializer
    filterset_class = PaymentFilter
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ("payment_number", "reference_number", "invoice__invoice_number")
    ordering_fields = ("created_at", "payment_date", "amount")

    def perform_create(self, serializer):
        instance = serializer.save(
            payment_number=next_payment_number(),
            recorded_by=self.request.user,
        )
        write_audit_log(user=self.request.user, action="create", instance=instance, request=self.request)

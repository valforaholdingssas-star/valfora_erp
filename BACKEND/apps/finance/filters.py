"""Filter sets for finance endpoints."""

import django_filters

from apps.finance.models import Contract, Invoice, Payment


class ContractFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    contract_type = django_filters.CharFilter(field_name="contract_type")
    contact = django_filters.UUIDFilter(field_name="contact")
    company = django_filters.UUIDFilter(field_name="company")
    deal = django_filters.UUIDFilter(field_name="deal")
    assigned_to = django_filters.UUIDFilter(field_name="assigned_to")
    start_date_after = django_filters.DateFilter(field_name="start_date", lookup_expr="gte")
    end_date_before = django_filters.DateFilter(field_name="end_date", lookup_expr="lte")

    class Meta:
        model = Contract
        fields = ("status", "contract_type", "contact", "company", "deal", "assigned_to")


class InvoiceFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name="status")
    contact = django_filters.UUIDFilter(field_name="contact")
    company = django_filters.UUIDFilter(field_name="company")
    contract = django_filters.UUIDFilter(field_name="contract")
    due_date_after = django_filters.DateFilter(field_name="due_date", lookup_expr="gte")
    due_date_before = django_filters.DateFilter(field_name="due_date", lookup_expr="lte")
    issue_date_after = django_filters.DateFilter(field_name="issue_date", lookup_expr="gte")
    issue_date_before = django_filters.DateFilter(field_name="issue_date", lookup_expr="lte")

    class Meta:
        model = Invoice
        fields = ("status", "contact", "company", "contract")


class PaymentFilter(django_filters.FilterSet):
    invoice = django_filters.UUIDFilter(field_name="invoice")
    contact = django_filters.UUIDFilter(field_name="invoice__contact")
    contract = django_filters.UUIDFilter(field_name="invoice__contract")
    payment_method = django_filters.CharFilter(field_name="payment_method")
    payment_date_after = django_filters.DateFilter(field_name="payment_date", lookup_expr="gte")
    payment_date_before = django_filters.DateFilter(field_name="payment_date", lookup_expr="lte")

    class Meta:
        model = Payment
        fields = ("invoice", "payment_method", "contact", "contract")

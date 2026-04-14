"""Serializers for finance APIs."""

from rest_framework import serializers

from apps.finance.models import Contract, ContractDocument, Invoice, InvoiceItem, Payment


class ContractDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractDocument
        fields = (
            "id",
            "contract",
            "name",
            "file",
            "document_type",
            "uploaded_by",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "uploaded_by", "created_at", "updated_at")


class ContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contract
        fields = (
            "id",
            "contract_number",
            "title",
            "deal",
            "contact",
            "company",
            "contract_type",
            "status",
            "description",
            "total_value",
            "currency",
            "start_date",
            "end_date",
            "signing_date",
            "payment_terms",
            "payment_schedule",
            "auto_renewal",
            "renewal_period_days",
            "cancellation_notice_days",
            "notes",
            "document",
            "assigned_to",
            "created_by",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "contract_number", "created_by", "created_at", "updated_at")


class InvoiceItemSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceItem
        fields = (
            "id",
            "invoice",
            "description",
            "quantity",
            "unit_price",
            "total",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "total", "created_at", "updated_at")

    def get_total(self, obj: InvoiceItem) -> float:
        return float(obj.total)


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, required=False)
    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_number",
            "contract",
            "contact",
            "company",
            "status",
            "issue_date",
            "due_date",
            "subtotal",
            "tax_rate",
            "tax_amount",
            "total_amount",
            "amount_paid",
            "balance_due",
            "currency",
            "notes",
            "assigned_to",
            "created_by",
            "items",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "invoice_number",
            "subtotal",
            "tax_amount",
            "total_amount",
            "amount_paid",
            "balance_due",
            "created_by",
            "created_at",
            "updated_at",
        )

    def get_balance_due(self, obj: Invoice) -> float:
        return float(obj.balance_due)

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        invoice = super().create(validated_data)
        for item in items_data:
            InvoiceItem.objects.create(invoice=invoice, **item)
        return invoice

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        invoice = super().update(instance, validated_data)
        if items_data is not None:
            invoice.items.filter(is_active=True).update(is_active=False)
            for item in items_data:
                InvoiceItem.objects.create(invoice=invoice, **item)
        return invoice


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id",
            "payment_number",
            "invoice",
            "amount",
            "payment_date",
            "payment_method",
            "reference_number",
            "notes",
            "receipt",
            "recorded_by",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "payment_number", "recorded_by", "created_at", "updated_at")

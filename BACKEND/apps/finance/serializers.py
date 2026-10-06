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
    contact_name = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    deal_title = serializers.SerializerMethodField()
    invoices_count = serializers.SerializerMethodField()
    collected_total = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = Contract
        fields = (
            "id",
            "contract_number",
            "title",
            "deal",
            "deal_title",
            "contact",
            "contact_name",
            "company",
            "company_name",
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
            "invoices_count",
            "collected_total",
            "balance_due",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "contract_number",
            "created_by",
            "contact_name",
            "company_name",
            "deal_title",
            "invoices_count",
            "collected_total",
            "balance_due",
            "created_at",
            "updated_at",
        )

    def get_contact_name(self, obj: Contract) -> str:
        if not obj.contact_id:
            return ""
        return f"{obj.contact.first_name} {obj.contact.last_name}".strip()

    def get_company_name(self, obj: Contract) -> str:
        return obj.company.name if obj.company_id else ""

    def get_deal_title(self, obj: Contract) -> str:
        return obj.deal.title if obj.deal_id else ""

    def get_invoices_count(self, obj: Contract) -> int:
        return obj.invoices.filter(is_active=True).count()

    def get_collected_total(self, obj: Contract) -> float:
        total = 0.0
        for invoice in obj.invoices.filter(is_active=True):
            total += float(invoice.amount_paid or 0)
        return total

    def get_balance_due(self, obj: Contract) -> float:
        total = 0.0
        for invoice in obj.invoices.filter(is_active=True, status__in=("sent", "partially_paid", "overdue")):
            total += float(invoice.balance_due or 0)
        return total


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
    contact_name = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    contract_number = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_number",
            "contract",
            "contract_number",
            "contact",
            "contact_name",
            "company",
            "company_name",
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
            "contact_name",
            "company_name",
            "contract_number",
            "created_by",
            "created_at",
            "updated_at",
        )

    def get_balance_due(self, obj: Invoice) -> float:
        return float(obj.balance_due)

    def get_contact_name(self, obj: Invoice) -> str:
        if not obj.contact_id:
            return ""
        return f"{obj.contact.first_name} {obj.contact.last_name}".strip()

    def get_company_name(self, obj: Invoice) -> str:
        return obj.company.name if obj.company_id else ""

    def get_contract_number(self, obj: Invoice) -> str:
        return obj.contract.contract_number if obj.contract_id else ""

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
    invoice_number = serializers.SerializerMethodField()
    contact_name = serializers.SerializerMethodField()
    contract_number = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "payment_number",
            "invoice",
            "invoice_number",
            "contact_name",
            "contract_number",
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
        read_only_fields = (
            "id",
            "payment_number",
            "invoice_number",
            "contact_name",
            "contract_number",
            "recorded_by",
            "created_at",
            "updated_at",
        )

    def get_invoice_number(self, obj: Payment) -> str:
        return obj.invoice.invoice_number if obj.invoice_id else ""

    def get_contact_name(self, obj: Payment) -> str:
        if not obj.invoice_id or not obj.invoice.contact_id:
            return ""
        contact = obj.invoice.contact
        return f"{contact.first_name} {contact.last_name}".strip()

    def get_contract_number(self, obj: Payment) -> str:
        if not obj.invoice_id or not obj.invoice.contract_id:
            return ""
        return obj.invoice.contract.contract_number

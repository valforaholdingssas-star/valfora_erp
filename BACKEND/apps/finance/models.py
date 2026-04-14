"""Finance domain models."""

from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.finance.managers import InvoiceManager


class Contract(BaseModel):
    """Commercial contract linked to CRM entities."""

    CONTRACT_TYPE_CHOICES = (
        ("service", "Service"),
        ("product", "Product"),
        ("subscription", "Subscription"),
        ("consulting", "Consulting"),
        ("other", "Other"),
    )
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("pending_signature", "Pending signature"),
        ("active", "Active"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
        ("expired", "Expired"),
    )
    PAYMENT_TERMS_CHOICES = (
        ("upfront", "Upfront"),
        ("net_15", "Net 15"),
        ("net_30", "Net 30"),
        ("net_60", "Net 60"),
        ("installments", "Installments"),
        ("custom", "Custom"),
    )

    contract_number = models.CharField(max_length=32, unique=True, db_index=True)
    title = models.CharField(max_length=255)
    deal = models.ForeignKey(
        "crm.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_contracts",
    )
    contact = models.ForeignKey(
        "crm.Contact",
        on_delete=models.PROTECT,
        related_name="finance_contracts",
    )
    company = models.ForeignKey(
        "crm.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_contracts",
    )
    contract_type = models.CharField(max_length=20, choices=CONTRACT_TYPE_CHOICES, default="service")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft", db_index=True)
    description = models.TextField(blank=True)
    total_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="COP")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    signing_date = models.DateField(null=True, blank=True)
    payment_terms = models.CharField(max_length=20, choices=PAYMENT_TERMS_CHOICES, default="custom")
    payment_schedule = models.JSONField(default=list, blank=True)
    auto_renewal = models.BooleanField(default=False)
    renewal_period_days = models.IntegerField(null=True, blank=True)
    cancellation_notice_days = models.IntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    document = models.FileField(upload_to="finance/contracts/%Y/%m/", null=True, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_contracts_assigned",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_contracts_created",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Contract"
        verbose_name_plural = "Contracts"

    def __str__(self) -> str:
        return self.contract_number


class ContractDocument(BaseModel):
    """Additional files related to a contract."""

    DOCUMENT_TYPE_CHOICES = (
        ("contract", "Contract"),
        ("amendment", "Amendment"),
        ("annex", "Annex"),
        ("addendum", "Addendum"),
        ("other", "Other"),
    )

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="documents")
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to="finance/contract-documents/%Y/%m/")
    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPE_CHOICES, default="other")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_contract_documents_uploaded",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Contract document"
        verbose_name_plural = "Contract documents"

    def __str__(self) -> str:
        return self.name


class Invoice(BaseModel):
    """Invoice linked to contract/contact/company."""

    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("sent", "Sent"),
        ("paid", "Paid"),
        ("partially_paid", "Partially paid"),
        ("overdue", "Overdue"),
        ("cancelled", "Cancelled"),
        ("void", "Void"),
    )

    invoice_number = models.CharField(max_length=32, unique=True, db_index=True)
    contract = models.ForeignKey(Contract, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices")
    contact = models.ForeignKey("crm.Contact", on_delete=models.PROTECT, related_name="invoices")
    company = models.ForeignKey(
        "crm.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft", db_index=True)
    issue_date = models.DateField()
    due_date = models.DateField()
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="COP")
    notes = models.TextField(blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_invoices_assigned",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_invoices_created",
    )

    objects = InvoiceManager()

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Invoice"
        verbose_name_plural = "Invoices"

    @property
    def balance_due(self) -> Decimal:
        return (self.total_amount or Decimal("0")) - (self.amount_paid or Decimal("0"))

    def __str__(self) -> str:
        return self.invoice_number


class InvoiceItem(BaseModel):
    """Invoice line items."""

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "Invoice item"
        verbose_name_plural = "Invoice items"

    @property
    def total(self) -> Decimal:
        return (self.quantity or Decimal("0")) * (self.unit_price or Decimal("0"))

    def __str__(self) -> str:
        return self.description


class Payment(BaseModel):
    """Payment registered against an invoice."""

    PAYMENT_METHOD_CHOICES = (
        ("bank_transfer", "Bank transfer"),
        ("cash", "Cash"),
        ("credit_card", "Credit card"),
        ("check", "Check"),
        ("other", "Other"),
    )

    payment_number = models.CharField(max_length=32, unique=True, db_index=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default="bank_transfer")
    reference_number = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    receipt = models.FileField(upload_to="finance/payments/%Y/%m/", null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_payments_recorded",
    )

    class Meta:
        ordering = ["-payment_date", "-created_at"]
        verbose_name = "Payment"
        verbose_name_plural = "Payments"

    def __str__(self) -> str:
        return self.payment_number

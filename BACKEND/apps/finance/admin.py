"""Admin for finance models."""

from django.contrib import admin

from apps.finance.models import Contract, ContractDocument, Invoice, InvoiceItem, Payment


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = ("contract_number", "title", "status", "contact", "total_value", "start_date", "end_date")
    list_filter = ("status", "contract_type", "currency")
    search_fields = ("contract_number", "title", "contact__email")


@admin.register(ContractDocument)
class ContractDocumentAdmin(admin.ModelAdmin):
    list_display = ("name", "contract", "document_type", "uploaded_by", "created_at")
    list_filter = ("document_type",)
    search_fields = ("name", "contract__contract_number")


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "contact", "status", "issue_date", "due_date", "total_amount", "amount_paid")
    list_filter = ("status", "currency")
    search_fields = ("invoice_number", "contact__email")
    inlines = [InvoiceItemInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("payment_number", "invoice", "amount", "payment_date", "payment_method")
    list_filter = ("payment_method",)
    search_fields = ("payment_number", "invoice__invoice_number", "reference_number")

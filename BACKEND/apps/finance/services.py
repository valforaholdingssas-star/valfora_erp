"""Service layer for finance business logic."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from apps.finance.models import Contract, Invoice, Payment


def _next_sequence(prefix: str, field_name: str, model_cls) -> str:
    year = timezone.now().year
    base = f"{prefix}-{year}-"
    candidates = model_cls.objects.filter(**{f"{field_name}__startswith": base}).values_list(field_name, flat=True)
    max_seq = 0
    for item in candidates:
        try:
            seq = int(str(item).split("-")[-1])
        except (TypeError, ValueError, IndexError):
            continue
        max_seq = max(max_seq, seq)
    return f"{base}{max_seq + 1:04d}"


def next_contract_number() -> str:
    return _next_sequence("CTR", "contract_number", Contract)


def next_invoice_number() -> str:
    return _next_sequence("INV", "invoice_number", Invoice)


def next_payment_number() -> str:
    return _next_sequence("PAY", "payment_number", Payment)


def compute_invoice_amounts(invoice: Invoice) -> Invoice:
    subtotal = Decimal("0")
    for item in invoice.items.filter(is_active=True):
        subtotal += item.total
    tax_amount = (subtotal * (invoice.tax_rate or Decimal("0"))) / Decimal("100")
    total = subtotal + tax_amount
    paid = invoice.payments.filter(is_active=True).aggregate(total=Sum("amount")).get("total") or Decimal("0")
    invoice.subtotal = subtotal
    invoice.tax_amount = tax_amount
    invoice.total_amount = total
    invoice.amount_paid = paid
    if total <= 0:
        invoice.status = "draft"
    elif paid <= 0 and invoice.status == "paid":
        invoice.status = "sent"
    elif 0 < paid < total:
        invoice.status = "partially_paid"
    elif paid >= total:
        invoice.status = "paid"
    invoice.save(update_fields=["subtotal", "tax_amount", "total_amount", "amount_paid", "status", "updated_at"])
    return invoice


def mark_overdue_invoices() -> int:
    today = timezone.localdate()
    qs = Invoice.objects.filter(
        is_active=True,
        status__in=("sent", "partially_paid"),
        due_date__lt=today,
    )
    return qs.update(status="overdue")


def receivables_queryset():
    return Invoice.objects.receivables().select_related("contact", "company", "contract")


def build_aging_report() -> dict:
    today = timezone.localdate()
    buckets = {
        "current": {"count": 0, "total": Decimal("0")},
        "days_1_30": {"count": 0, "total": Decimal("0")},
        "days_31_60": {"count": 0, "total": Decimal("0")},
        "days_61_90": {"count": 0, "total": Decimal("0")},
        "days_90_plus": {"count": 0, "total": Decimal("0")},
    }
    for invoice in receivables_queryset():
        balance = invoice.balance_due
        if balance <= 0:
            continue
        days = (today - invoice.due_date).days
        if days <= 0:
            bucket = "current"
        elif days <= 30:
            bucket = "days_1_30"
        elif days <= 60:
            bucket = "days_31_60"
        elif days <= 90:
            bucket = "days_61_90"
        else:
            bucket = "days_90_plus"
        buckets[bucket]["count"] += 1
        buckets[bucket]["total"] += balance

    total_receivable = sum((buckets[key]["total"] for key in buckets), Decimal("0"))
    total_overdue = (
        buckets["days_1_30"]["total"]
        + buckets["days_31_60"]["total"]
        + buckets["days_61_90"]["total"]
        + buckets["days_90_plus"]["total"]
    )
    return {
        **{
            key: {"count": value["count"], "total": float(value["total"])}
            for key, value in buckets.items()
        },
        "total_receivable": float(total_receivable),
        "total_overdue": float(total_overdue),
    }


def build_finance_dashboard(start: date, end: date) -> dict:
    invoices = Invoice.objects.filter(is_active=True, issue_date__range=(start, end))
    payments = Payment.objects.filter(is_active=True, payment_date__range=(start, end))
    contracts = Contract.objects.filter(is_active=True)

    invoiced_total = invoices.aggregate(v=Sum("total_amount")).get("v") or Decimal("0")
    paid_total = payments.aggregate(v=Sum("amount")).get("v") or Decimal("0")
    receivables_total = sum((inv.balance_due for inv in receivables_queryset()), Decimal("0"))
    overdue_total = sum(
        (inv.balance_due for inv in receivables_queryset().filter(status="overdue")),
        Decimal("0"),
    )
    collection_rate = float((paid_total / invoiced_total * Decimal("100")) if invoiced_total > 0 else Decimal("0"))

    monthly_incomes = []
    month_cursor = date(start.year, start.month, 1)
    while month_cursor <= end:
        next_month = (month_cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
        total = Payment.objects.filter(
            is_active=True,
            payment_date__gte=month_cursor,
            payment_date__lt=next_month,
        ).aggregate(v=Sum("amount")).get("v") or Decimal("0")
        monthly_incomes.append({"month": month_cursor.strftime("%Y-%m"), "value": float(total)})
        month_cursor = next_month

    contracts_by_status = (
        contracts.values("status")
        .annotate(total=Sum("total_value"), count=Count("id"))
        .order_by("status")
    )
    top_clients = (
        invoices.values("contact_id", "contact__first_name", "contact__last_name")
        .annotate(total=Sum("total_amount"))
        .order_by("-total")[:10]
    )
    expiring_contracts = contracts.filter(
        status="active",
        end_date__isnull=False,
        end_date__lte=timezone.localdate() + timedelta(days=90),
    ).values("id", "contract_number", "title", "end_date", "total_value")

    return {
        "kpis": {
            "invoiced_total": float(invoiced_total),
            "paid_total": float(paid_total),
            "receivables_total": float(receivables_total),
            "overdue_total": float(overdue_total),
            "collection_rate": collection_rate,
            "active_contracts": contracts.filter(status="active").count(),
        },
        "monthly_income": monthly_incomes,
        "contracts_by_status": list(contracts_by_status),
        "aging": build_aging_report(),
        "top_clients": [
            {
                "contact_id": str(item["contact_id"]),
                "name": f"{item['contact__first_name']} {item['contact__last_name']}".strip(),
                "total": float(item["total"] or 0),
            }
            for item in top_clients
        ],
        "billing_vs_collection": {
            "invoiced": float(invoiced_total),
            "collected": float(paid_total),
        },
        "expiring_contracts": [
            {
                "id": str(item["id"]),
                "contract_number": item["contract_number"],
                "title": item["title"],
                "end_date": item["end_date"].isoformat() if item["end_date"] else None,
                "total_value": float(item["total_value"] or 0),
            }
            for item in expiring_contracts
        ],
    }

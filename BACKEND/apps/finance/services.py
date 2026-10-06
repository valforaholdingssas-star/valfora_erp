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


def _iter_months(start: date, end: date):
    month_cursor = date(start.year, start.month, 1)
    while month_cursor <= end:
        next_month = (month_cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield month_cursor, next_month
        month_cursor = next_month


def build_cash_flow_report(start: date, end: date) -> dict:
    """Ingresos (pagos), facturación y cartera pendiente por mes en un rango."""

    monthly_income = []
    monthly_billing = []
    for month_start, next_month in _iter_months(start, end):
        income = Payment.objects.filter(
            is_active=True,
            payment_date__gte=month_start,
            payment_date__lt=next_month,
            payment_date__lte=end,
        ).aggregate(v=Sum("amount")).get("v") or Decimal("0")
        billing = Invoice.objects.filter(
            is_active=True,
            issue_date__gte=month_start,
            issue_date__lt=next_month,
            issue_date__lte=end,
            status__in=("sent", "paid", "partially_paid", "overdue"),
        ).aggregate(v=Sum("total_amount")).get("v") or Decimal("0")
        label = month_start.strftime("%Y-%m")
        monthly_income.append({"month": label, "value": float(income)})
        monthly_billing.append({"month": label, "value": float(billing)})

    payments_qs = Payment.objects.filter(is_active=True, payment_date__range=(start, end))
    invoices_qs = Invoice.objects.filter(
        is_active=True,
        issue_date__range=(start, end),
        status__in=("sent", "paid", "partially_paid", "overdue"),
    )
    paid_total = payments_qs.aggregate(v=Sum("amount")).get("v") or Decimal("0")
    invoiced_total = invoices_qs.aggregate(v=Sum("total_amount")).get("v") or Decimal("0")
    receivables_total = sum((inv.balance_due for inv in receivables_queryset()), Decimal("0"))
    overdue_total = sum(
        (inv.balance_due for inv in receivables_queryset().filter(status="overdue")),
        Decimal("0"),
    )

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "kpis": {
            "invoiced_total": float(invoiced_total),
            "collected_total": float(paid_total),
            "receivables_total": float(receivables_total),
            "overdue_total": float(overdue_total),
            "net_gap": float(invoiced_total - paid_total),
            "collection_rate": float(
                (paid_total / invoiced_total * Decimal("100")) if invoiced_total > 0 else Decimal("0")
            ),
            "payments_count": payments_qs.count(),
            "invoices_count": invoices_qs.count(),
        },
        "monthly_income": monthly_income,
        "monthly_billing": monthly_billing,
        "billing_vs_collection": {
            "invoiced": float(invoiced_total),
            "collected": float(paid_total),
        },
    }


def build_portfolio_by_client() -> dict:
    """Cartera agrupada por cliente: contratos, facturado, cobrado y saldo."""

    clients: dict[str, dict] = {}
    for contract in Contract.objects.filter(is_active=True).select_related("contact", "company"):
        key = str(contract.contact_id)
        row = clients.setdefault(
            key,
            {
                "contact_id": key,
                "contact_name": f"{contract.contact.first_name} {contract.contact.last_name}".strip(),
                "company_name": contract.company.name if contract.company_id else "",
                "contracts_count": 0,
                "contracts_value": Decimal("0"),
                "invoiced_total": Decimal("0"),
                "collected_total": Decimal("0"),
                "balance_due": Decimal("0"),
                "overdue_balance": Decimal("0"),
                "open_invoices": 0,
            },
        )
        row["contracts_count"] += 1
        row["contracts_value"] += contract.total_value or Decimal("0")

    for invoice in Invoice.objects.filter(is_active=True).select_related("contact", "company"):
        key = str(invoice.contact_id)
        row = clients.setdefault(
            key,
            {
                "contact_id": key,
                "contact_name": f"{invoice.contact.first_name} {invoice.contact.last_name}".strip(),
                "company_name": invoice.company.name if invoice.company_id else "",
                "contracts_count": 0,
                "contracts_value": Decimal("0"),
                "invoiced_total": Decimal("0"),
                "collected_total": Decimal("0"),
                "balance_due": Decimal("0"),
                "overdue_balance": Decimal("0"),
                "open_invoices": 0,
            },
        )
        if invoice.status in {"sent", "paid", "partially_paid", "overdue"}:
            row["invoiced_total"] += invoice.total_amount or Decimal("0")
            row["collected_total"] += invoice.amount_paid or Decimal("0")
        balance = invoice.balance_due
        if invoice.status in {"sent", "partially_paid", "overdue"} and balance > 0:
            row["balance_due"] += balance
            row["open_invoices"] += 1
            if invoice.status == "overdue" or invoice.due_date < timezone.localdate():
                row["overdue_balance"] += balance

    results = []
    for row in clients.values():
        results.append(
            {
                **row,
                "contracts_value": float(row["contracts_value"]),
                "invoiced_total": float(row["invoiced_total"]),
                "collected_total": float(row["collected_total"]),
                "balance_due": float(row["balance_due"]),
                "overdue_balance": float(row["overdue_balance"]),
            }
        )
    results.sort(key=lambda item: item["balance_due"], reverse=True)
    return {
        "results": results,
        "metrics": {
            "clients_count": len(results),
            "total_balance_due": sum(item["balance_due"] for item in results),
            "total_overdue": sum(item["overdue_balance"] for item in results),
            "total_contracts_value": sum(item["contracts_value"] for item in results),
        },
    }


def build_finance_dashboard(start: date, end: date) -> dict:
    cash_flow = build_cash_flow_report(start, end)
    contracts = Contract.objects.filter(is_active=True)

    contracts_by_status = (
        contracts.values("status")
        .annotate(total=Sum("total_value"), count=Count("id"))
        .order_by("status")
    )
    top_clients = (
        Invoice.objects.filter(is_active=True, issue_date__range=(start, end))
        .values("contact_id", "contact__first_name", "contact__last_name")
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
            **cash_flow["kpis"],
            "paid_total": cash_flow["kpis"]["collected_total"],
            "active_contracts": contracts.filter(status="active").count(),
        },
        "monthly_income": cash_flow["monthly_income"],
        "monthly_billing": cash_flow["monthly_billing"],
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
        "billing_vs_collection": cash_flow["billing_vs_collection"],
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
        "portfolio": build_portfolio_by_client(),
    }

"""Additional finance API views."""

from datetime import date

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.permissions import IsFinanceWriteAdmin
from apps.finance.services import (
    build_aging_report,
    build_cash_flow_report,
    build_finance_dashboard,
    build_portfolio_by_client,
    receivables_queryset,
)


def _resolve_date_range(request) -> tuple[date, date]:
    period = request.query_params.get("period", "year")
    start_date_raw = request.query_params.get("start_date")
    end_date_raw = request.query_params.get("end_date")
    today = timezone.localdate()
    if start_date_raw and end_date_raw:
        return date.fromisoformat(start_date_raw), date.fromisoformat(end_date_raw)
    if period == "month":
        return today.replace(day=1), today
    if period == "quarter":
        quarter = ((today.month - 1) // 3) + 1
        first_month = (quarter - 1) * 3 + 1
        return date(today.year, first_month, 1), today
    return date(today.year, 1, 1), today


class ReceivablesView(APIView):
    """Receivables list + aggregate metrics (Cartera)."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

    def get(self, request):
        qs = receivables_queryset()
        status_param = request.query_params.get("status")
        contact_param = request.query_params.get("contact")
        contract_param = request.query_params.get("contract")
        start_date = request.query_params.get("start_date") or request.query_params.get("due_date_after")
        end_date = request.query_params.get("end_date") or request.query_params.get("due_date_before")
        issue_after = request.query_params.get("issue_date_after")
        issue_before = request.query_params.get("issue_date_before")
        aging = request.query_params.get("aging")
        search = (request.query_params.get("search") or "").strip().lower()

        if status_param:
            qs = qs.filter(status=status_param)
        if contact_param:
            qs = qs.filter(contact_id=contact_param)
        if contract_param:
            qs = qs.filter(contract_id=contract_param)
        if start_date:
            qs = qs.filter(due_date__gte=start_date)
        if end_date:
            qs = qs.filter(due_date__lte=end_date)
        if issue_after:
            qs = qs.filter(issue_date__gte=issue_after)
        if issue_before:
            qs = qs.filter(issue_date__lte=issue_before)

        today = timezone.localdate()
        output = []
        for inv in qs:
            days_overdue = (today - inv.due_date).days
            if aging == "current" and days_overdue > 0:
                continue
            if aging == "0_30" and not (1 <= days_overdue <= 30):
                continue
            if aging == "31_60" and not (31 <= days_overdue <= 60):
                continue
            if aging == "61_90" and not (61 <= days_overdue <= 90):
                continue
            if aging == "90_plus" and not (days_overdue > 90):
                continue

            contact_name = f"{inv.contact.first_name} {inv.contact.last_name}".strip()
            company_name = inv.company.name if inv.company_id else ""
            if search:
                haystack = " ".join(
                    [
                        inv.invoice_number or "",
                        contact_name,
                        company_name,
                        inv.contract.contract_number if inv.contract_id else "",
                    ]
                ).lower()
                if search not in haystack:
                    continue

            output.append(
                {
                    "id": str(inv.id),
                    "invoice_number": inv.invoice_number,
                    "contact_id": str(inv.contact_id),
                    "contact": contact_name,
                    "contact_name": contact_name,
                    "company_name": company_name,
                    "contract_id": str(inv.contract_id) if inv.contract_id else None,
                    "contract_number": inv.contract.contract_number if inv.contract_id else None,
                    "total_amount": float(inv.total_amount),
                    "amount_paid": float(inv.amount_paid),
                    "balance_due": float(inv.balance_due),
                    "currency": inv.currency,
                    "days_overdue": max(0, days_overdue),
                    "status": inv.status,
                    "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
                    "due_date": inv.due_date.isoformat(),
                }
            )

        total_receivable = sum(item["balance_due"] for item in output)
        total_overdue = sum(item["balance_due"] for item in output if item["days_overdue"] > 0)
        return Response(
            {
                "results": output,
                "metrics": {
                    "total_receivable": total_receivable,
                    "total_overdue": total_overdue,
                    "count": len(output),
                    "current_balance": sum(item["balance_due"] for item in output if item["days_overdue"] == 0),
                },
                "aging": build_aging_report(),
            }
        )


class AgingReportView(APIView):
    """Aging report summary."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

    def get(self, request):
        del request
        return Response(build_aging_report())


class PortfolioByClientView(APIView):
    """Cartera consolidada por cliente (contratos + saldos)."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

    def get(self, request):
        del request
        return Response(build_portfolio_by_client())


class CashFlowView(APIView):
    """Ingresos y facturación por fechas / meses."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

    def get(self, request):
        start, end = _resolve_date_range(request)
        return Response(build_cash_flow_report(start, end))


class FinanceDashboardView(APIView):
    """Finance dashboard payload with KPIs/charts."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

    def get(self, request):
        start, end = _resolve_date_range(request)
        return Response(build_finance_dashboard(start, end))

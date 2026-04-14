"""Additional finance API views."""

from datetime import date

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.permissions import IsFinanceWriteAdmin
from apps.finance.services import build_aging_report, build_finance_dashboard, receivables_queryset


class ReceivablesView(APIView):
    """Receivables list + aggregate metrics."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

    def get(self, request):
        qs = receivables_queryset()
        status_param = request.query_params.get("status")
        contact_param = request.query_params.get("contact")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        aging = request.query_params.get("aging")

        if status_param:
            qs = qs.filter(status=status_param)
        if contact_param:
            qs = qs.filter(contact_id=contact_param)
        if start_date:
            qs = qs.filter(due_date__gte=start_date)
        if end_date:
            qs = qs.filter(due_date__lte=end_date)

        today = timezone.localdate()
        output = []
        for inv in qs:
            days_overdue = (today - inv.due_date).days
            if aging == "0_30" and not (0 <= days_overdue <= 30):
                continue
            if aging == "31_60" and not (31 <= days_overdue <= 60):
                continue
            if aging == "61_90" and not (61 <= days_overdue <= 90):
                continue
            if aging == "90_plus" and not (days_overdue > 90):
                continue
            output.append(
                {
                    "id": str(inv.id),
                    "invoice_number": inv.invoice_number,
                    "contact": str(inv.contact),
                    "contract_number": inv.contract.contract_number if inv.contract_id else None,
                    "total_amount": float(inv.total_amount),
                    "amount_paid": float(inv.amount_paid),
                    "balance_due": float(inv.balance_due),
                    "days_overdue": max(0, days_overdue),
                    "status": inv.status,
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
                },
            }
        )


class AgingReportView(APIView):
    """Aging report summary."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

    def get(self, request):
        del request
        return Response(build_aging_report())


class FinanceDashboardView(APIView):
    """Finance dashboard payload with KPIs/charts."""

    permission_classes = [permissions.IsAuthenticated, IsFinanceWriteAdmin]

    def get(self, request):
        period = request.query_params.get("period", "year")
        start_date_raw = request.query_params.get("start_date")
        end_date_raw = request.query_params.get("end_date")
        today = timezone.localdate()
        if start_date_raw and end_date_raw:
            start = date.fromisoformat(start_date_raw)
            end = date.fromisoformat(end_date_raw)
        elif period == "month":
            start = today.replace(day=1)
            end = today
        elif period == "quarter":
            quarter = ((today.month - 1) // 3) + 1
            first_month = (quarter - 1) * 3 + 1
            start = date(today.year, first_month, 1)
            end = today
        else:
            start = date(today.year, 1, 1)
            end = today
        return Response(build_finance_dashboard(start, end))

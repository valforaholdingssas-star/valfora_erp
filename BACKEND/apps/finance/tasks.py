"""Celery tasks for finance app."""

from celery import shared_task

from apps.finance.services import mark_overdue_invoices


@shared_task
def mark_overdue_invoices_task() -> int:
    """Mark sent/partial invoices as overdue when due date has passed."""

    return mark_overdue_invoices()

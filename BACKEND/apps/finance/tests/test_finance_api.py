"""Basic finance API tests."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Contact
from apps.finance.models import Invoice


@pytest.mark.django_db
def test_finance_dashboard_returns_payload(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get("/api/v1/finance/dashboard/")
    assert response.status_code == 200
    body = response.json()["data"]
    assert "kpis" in body
    assert "monthly_income" in body


@pytest.mark.django_db
def test_receivables_endpoint_returns_metrics(admin_user):
    contact = Contact.objects.create(
        first_name="Fin",
        last_name="Client",
        email="fin.client@test.com",
        created_by=admin_user,
        assigned_to=admin_user,
    )
    Invoice.objects.create(
        invoice_number="INV-2026-0001",
        contact=contact,
        status="sent",
        issue_date=timezone.localdate() - timedelta(days=20),
        due_date=timezone.localdate() - timedelta(days=5),
        subtotal=Decimal("1000"),
        tax_rate=Decimal("0"),
        tax_amount=Decimal("0"),
        total_amount=Decimal("1000"),
        amount_paid=Decimal("0"),
        created_by=admin_user,
    )
    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get("/api/v1/finance/receivables/")
    assert response.status_code == 200
    body = response.json()["data"]
    assert "results" in body
    assert "metrics" in body

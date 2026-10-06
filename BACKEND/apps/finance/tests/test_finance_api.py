"""Finance API tests: contracts, invoices, payments, cartera and cash-flow."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Contact
from apps.finance.models import Contract, Invoice, InvoiceItem, Payment
from apps.finance.services import compute_invoice_amounts, mark_overdue_invoices


@pytest.fixture
def finance_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def contact(admin_user):
    return Contact.objects.create(
        first_name="Ana",
        last_name="Cliente",
        email="ana.cliente@test.com",
        created_by=admin_user,
        assigned_to=admin_user,
    )


@pytest.mark.django_db
def test_finance_dashboard_returns_payload(finance_client):
    response = finance_client.get("/api/v1/finance/dashboard/")
    assert response.status_code == 200
    body = response.json()["data"]
    assert "kpis" in body
    assert "monthly_income" in body
    assert "monthly_billing" in body
    assert "portfolio" in body


@pytest.mark.django_db
def test_contract_invoice_payment_cartera_flow(finance_client, admin_user, contact):
    contract_resp = finance_client.post(
        "/api/v1/finance/contracts/",
        {
            "title": "Mentoría Valfora",
            "contact": str(contact.id),
            "contract_type": "service",
            "status": "active",
            "total_value": "3000000",
            "currency": "COP",
            "start_date": str(timezone.localdate()),
            "payment_terms": "installments",
            "payment_schedule": [
                {"due_date": str(timezone.localdate() + timedelta(days=15)), "amount": 1500000, "description": "Cuota 1"},
                {"due_date": str(timezone.localdate() + timedelta(days=45)), "amount": 1500000, "description": "Cuota 2"},
            ],
        },
        format="json",
    )
    assert contract_resp.status_code == 201, contract_resp.content
    contract_id = contract_resp.json()["data"]["id"]

    invoice_resp = finance_client.post(
        "/api/v1/finance/invoices/",
        {
            "contact": str(contact.id),
            "contract": contract_id,
            "status": "sent",
            "issue_date": str(timezone.localdate()),
            "due_date": str(timezone.localdate() + timedelta(days=15)),
            "tax_rate": "0",
            "currency": "COP",
            "items": [{"description": "Cuota 1 mentoring", "quantity": 1, "unit_price": "1500000"}],
        },
        format="json",
    )
    assert invoice_resp.status_code == 201, invoice_resp.content
    invoice = invoice_resp.json()["data"]
    assert invoice["contract"] == contract_id
    assert float(invoice["balance_due"]) == 1500000

    payment_resp = finance_client.post(
        "/api/v1/finance/payments/",
        {
            "invoice": invoice["id"],
            "amount": "500000",
            "payment_date": str(timezone.localdate()),
            "payment_method": "bank_transfer",
            "reference_number": "TRX-1",
        },
        format="json",
    )
    assert payment_resp.status_code == 201, payment_resp.content

    receivables = finance_client.get("/api/v1/finance/receivables/")
    assert receivables.status_code == 200
    body = receivables.json()["data"]
    assert body["metrics"]["total_receivable"] == 1000000
    assert any(row["invoice_number"] == invoice["invoice_number"] for row in body["results"])

    portfolio = finance_client.get("/api/v1/finance/portfolio/")
    assert portfolio.status_code == 200
    portfolio_body = portfolio.json()["data"]
    assert portfolio_body["metrics"]["clients_count"] >= 1
    client_row = next(row for row in portfolio_body["results"] if row["contact_id"] == str(contact.id))
    assert client_row["balance_due"] == 1000000
    assert client_row["contracts_count"] >= 1

    cash_flow = finance_client.get("/api/v1/finance/cash-flow/", {"period": "year"})
    assert cash_flow.status_code == 200
    cash_body = cash_flow.json()["data"]
    assert cash_body["kpis"]["collected_total"] == 500000
    assert cash_body["kpis"]["invoiced_total"] == 1500000
    assert "monthly_income" in cash_body
    assert "monthly_billing" in cash_body


@pytest.mark.django_db
def test_receivables_endpoint_returns_metrics(finance_client, admin_user, contact):
    Invoice.objects.create(
        invoice_number="INV-2026-0099",
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
    response = finance_client.get("/api/v1/finance/receivables/")
    assert response.status_code == 200
    body = response.json()["data"]
    assert "results" in body
    assert "metrics" in body
    assert "aging" in body


@pytest.mark.django_db
def test_mark_overdue_invoices(admin_user, contact):
    invoice = Invoice.objects.create(
        invoice_number="INV-2026-0100",
        contact=contact,
        status="sent",
        issue_date=timezone.localdate() - timedelta(days=40),
        due_date=timezone.localdate() - timedelta(days=10),
        subtotal=Decimal("2000"),
        tax_rate=Decimal("0"),
        tax_amount=Decimal("0"),
        total_amount=Decimal("2000"),
        amount_paid=Decimal("0"),
        created_by=admin_user,
    )
    InvoiceItem.objects.create(invoice=invoice, description="Servicio", quantity=1, unit_price=Decimal("2000"))
    compute_invoice_amounts(invoice)
    updated = mark_overdue_invoices()
    assert updated >= 1
    invoice.refresh_from_db()
    assert invoice.status == "overdue"


@pytest.mark.django_db
def test_contracts_filter_by_contact(finance_client, contact):
    Contract.objects.create(
        contract_number="CTR-2026-0001",
        title="Contrato filtro",
        contact=contact,
        status="active",
        total_value=Decimal("100"),
        start_date=timezone.localdate(),
    )
    response = finance_client.get("/api/v1/finance/contracts/", {"contact": str(contact.id)})
    assert response.status_code == 200
    results = response.json()["data"]["results"]
    assert len(results) >= 1
    assert results[0]["contact_name"]

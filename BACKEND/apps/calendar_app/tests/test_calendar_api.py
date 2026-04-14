"""Calendar API tests."""

from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import Activity, Contact, Deal


@pytest.mark.django_db
def test_calendar_events_returns_activity_followup_and_deal(admin_user):
    """Calendar endpoint returns aggregated events in range."""
    stale_days = int(getattr(settings, "CRM_STALE_CONTACT_DAYS", 14))
    contact = Contact.objects.create(
        first_name="Ana",
        last_name="Prueba",
        email="ana.calendar@test.com",
        last_contact_date=timezone.now() - timedelta(days=max(stale_days - 4, 0)),
        assigned_to=admin_user,
        created_by=admin_user,
    )
    now = timezone.now()
    Activity.objects.create(
        contact=contact,
        activity_type="call",
        subject="Llamada de seguimiento",
        due_date=now + timedelta(days=2),
        assigned_to=admin_user,
        created_by=admin_user,
    )
    Deal.objects.create(
        title="Deal calendario",
        contact=contact,
        stage="proposal",
        expected_close_date=(now + timedelta(days=4)).date(),
        assigned_to=admin_user,
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)
    response = client.get(
        "/api/v1/calendar/events/",
        {
            "start_date": now.date().isoformat(),
            "end_date": (now + timedelta(days=365)).date().isoformat(),
        },
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert isinstance(payload, list)
    event_types = {item["type"] for item in payload}
    assert "activity" in event_types or "overdue" in event_types
    assert "deal_close" in event_types
    assert "follow_up" in event_types

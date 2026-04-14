"""API tests for notifications."""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.notifications.models import Notification


@pytest.mark.django_db
def test_notification_list_requires_auth():
    client = APIClient()
    url = reverse("notification-list")
    r = client.get(url)
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_notification_mark_all_read(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    Notification.objects.create(
        recipient=admin_user,
        notification_type="system",
        title="Test",
        message="Hi",
    )
    url = reverse("notification-mark-all-read")
    r = client.post(url)
    assert r.status_code == status.HTTP_200_OK
    assert Notification.objects.filter(recipient=admin_user, is_read=True).count() == 1


@pytest.mark.django_db
def test_inbound_message_creates_notification(admin_user, contact_factory, conversation_factory):
    from apps.chat.models import Message

    contact = contact_factory(assigned_to=admin_user)
    conv = conversation_factory(contact=contact, assigned_to=admin_user)
    Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Hola",
    )
    assert Notification.objects.filter(recipient=admin_user, notification_type="chat_message").exists()


@pytest.fixture
def contact_factory(db, admin_user):
    from apps.crm.models import Contact

    def _make(**kwargs):
        defaults = {
            "first_name": "A",
            "last_name": "B",
            "email": "a@example.com",
            "assigned_to": admin_user,
        }
        defaults.update(kwargs)
        return Contact.objects.create(**defaults)

    return _make


@pytest.fixture
def conversation_factory(db):
    from apps.chat.models import Conversation

    def _make(contact, assigned_to=None, **kwargs):
        defaults = {
            "contact": contact,
            "channel": "whatsapp",
            "status": "active",
            "assigned_to": assigned_to,
        }
        defaults.update(kwargs)
        return Conversation.objects.create(**defaults)

    return _make

"""Tests for WhatsApp contact matching utilities."""

import pytest

from apps.crm.models import Contact
from apps.whatsapp.services.contact_matcher import (
    find_contact_by_phone,
    get_or_create_contact_from_wa,
    normalize_phone,
)


@pytest.mark.django_db
def test_normalize_phone_removes_non_digits():
    assert normalize_phone("+57 (300) 123-45-67") == "573001234567"


@pytest.mark.django_db
def test_find_contact_by_phone_matches_suffix():
    contact = Contact.objects.create(
        first_name="Ana",
        last_name="Lopez",
        email="ana@example.com",
        phone_number="3001234567",
        whatsapp_number="+57 300 123 4567",
    )
    found = find_contact_by_phone("573001234567")
    assert found is not None
    assert found.id == contact.id


@pytest.mark.django_db
def test_get_or_create_contact_returns_existing_when_match_found():
    contact = Contact.objects.create(
        first_name="Luis",
        last_name="Perez",
        email="luis@example.com",
        whatsapp_number="573019999111",
    )
    resolved, created = get_or_create_contact_from_wa(phone="+57 301 999 9111", profile_name="Otro Nombre")
    assert created is False
    assert resolved.id == contact.id


@pytest.mark.django_db
def test_get_or_create_contact_creates_new_record_for_unknown_phone():
    contact, created = get_or_create_contact_from_wa(phone="+57 310 888 7777", profile_name="Maria Gomez")
    assert created is True
    assert contact.first_name == "Maria"
    assert contact.last_name == "Gomez"
    assert contact.whatsapp_number == "573108887777"
    assert contact.email == "wa-573108887777@auto.local"

"""Models for WhatsApp Business Cloud API integration."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


def _build_fernet() -> Fernet:
    """Derive symmetric encryption key from project secret."""

    raw = str(settings.SECRET_KEY).encode("utf-8")
    digest = hashlib.sha256(raw).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


class EncryptedTextField(models.TextField):
    """Text field transparently encrypted at rest using Fernet."""

    description = "Encrypted text"

    def from_db_value(self, value, expression, connection):  # noqa: ANN001
        return self.to_python(value)

    def to_python(self, value):  # noqa: ANN001
        if value is None or value == "":
            return value
        if isinstance(value, str) and value.startswith("enc::"):
            token = value.replace("enc::", "", 1).encode("utf-8")
            try:
                decrypted = _build_fernet().decrypt(token)
                return decrypted.decode("utf-8")
            except (InvalidToken, ValueError):
                return ""
        return value

    def get_prep_value(self, value):  # noqa: ANN001
        if value is None or value == "":
            return value
        if isinstance(value, str) and value.startswith("enc::"):
            return value
        encrypted = _build_fernet().encrypt(str(value).encode("utf-8")).decode("utf-8")
        return f"enc::{encrypted}"


class WhatsAppBusinessAccount(BaseModel):
    """Meta WhatsApp Business account credentials and metadata."""

    name = models.CharField(max_length=120)
    waba_id = models.CharField(max_length=128, unique=True, db_index=True)
    access_token = EncryptedTextField()
    api_version = models.CharField(max_length=12, default="v21.0")
    webhook_verify_token = models.CharField(max_length=255)
    webhook_secret = EncryptedTextField(blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "WhatsApp business account"
        verbose_name_plural = "WhatsApp business accounts"

    def __str__(self) -> str:
        return self.name


class WhatsAppPhoneNumber(BaseModel):
    """Phone numbers available under a WABA account."""

    STATUS_CHOICES = (
        ("connected", "Connected"),
        ("disconnected", "Disconnected"),
        ("banned", "Banned"),
        ("pending", "Pending"),
    )

    account = models.ForeignKey(
        WhatsAppBusinessAccount,
        on_delete=models.CASCADE,
        related_name="phone_numbers",
    )
    phone_number_id = models.CharField(max_length=128, unique=True, db_index=True)
    display_phone_number = models.CharField(max_length=40)
    verified_name = models.CharField(max_length=255, blank=True)
    quality_rating = models.CharField(max_length=30, default="UNKNOWN")
    messaging_limit = models.CharField(max_length=30, default="TIER_250")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    is_default = models.BooleanField(default=False)
    default_assigned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="whatsapp_default_numbers",
    )

    class Meta:
        ordering = ["display_phone_number"]
        verbose_name = "WhatsApp phone number"
        verbose_name_plural = "WhatsApp phone numbers"

    def __str__(self) -> str:
        return self.display_phone_number


class WhatsAppTemplate(BaseModel):
    """Message templates synchronized from Meta or managed internally."""

    CATEGORY_CHOICES = (
        ("marketing", "Marketing"),
        ("utility", "Utility"),
        ("authentication", "Authentication"),
    )
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("paused", "Paused"),
        ("disabled", "Disabled"),
    )
    HEADER_TYPE_CHOICES = (
        ("none", "None"),
        ("text", "Text"),
        ("image", "Image"),
        ("video", "Video"),
        ("document", "Document"),
    )

    account = models.ForeignKey(
        WhatsAppBusinessAccount,
        on_delete=models.CASCADE,
        related_name="templates",
    )
    meta_template_id = models.CharField(max_length=128, blank=True)
    name = models.CharField(max_length=255, db_index=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    language = models.CharField(max_length=12, default="es")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    rejection_reason = models.TextField(blank=True)
    header_type = models.CharField(max_length=20, choices=HEADER_TYPE_CHOICES, default="none")
    header_content = models.TextField(blank=True)
    body_text = models.TextField()
    footer_text = models.CharField(max_length=255, blank=True)
    buttons = models.JSONField(default=list, blank=True)
    example_values = models.JSONField(default=list, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "WhatsApp template"
        verbose_name_plural = "WhatsApp templates"
        unique_together = (("account", "name", "language"),)

    def __str__(self) -> str:
        return f"{self.name} ({self.language})"

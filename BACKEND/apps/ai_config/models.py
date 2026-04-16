"""Models for LLM configuration (per deployment / tenant)."""

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


class AIConfiguration(BaseModel):
    """Configurable prompts and model parameters for chat AI."""

    name = models.CharField(max_length=120, default="Default")
    system_prompt = models.TextField(
        blank=True,
        help_text="Instrucciones base para el asistente (idioma, tono, límites).",
    )
    temperature = models.FloatField(default=0.7)
    max_tokens = models.PositiveIntegerField(default=512)
    llm_model = models.CharField(max_length=80, default="gpt-4o-mini")
    is_default = models.BooleanField(default=False, db_index=True)
    max_history_messages = models.PositiveSmallIntegerField(
        default=20,
        help_text="Mensajes de historial incluidos en el prompt.",
    )
    moderation_enabled = models.BooleanField(
        default=True,
        help_text="Si está activo, las respuestas pasan por la API de moderación de OpenAI.",
    )
    daily_token_budget_per_conversation = models.PositiveIntegerField(
        default=100_000,
        help_text="Máximo de tokens (prompt+completion) por conversación y día UTC.",
    )
    rag_enabled = models.BooleanField(
        default=True,
        help_text="Incluir fragmentos relevantes de documentos CRM (RAG) en el prompt.",
    )
    rag_top_k = models.PositiveSmallIntegerField(
        default=5,
        help_text="Número máximo de chunks de documentos a inyectar en el system prompt.",
    )

    class Meta:
        verbose_name = "AI configuration"
        verbose_name_plural = "AI configurations"
        ordering = ["-is_default", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.llm_model})"

    def save(self, *args, **kwargs) -> None:
        if self.is_default:
            AIConfiguration.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class AIRuntimeSettings(BaseModel):
    """Mutable runtime credentials/settings for OpenAI integration."""

    singleton_key = models.CharField(max_length=32, unique=True, default="default")
    openai_api_key = EncryptedTextField(blank=True)
    openai_embedding_model = models.CharField(max_length=120, default="text-embedding-3-small")
    openai_moderation_disabled = models.BooleanField(default=False)

    class Meta:
        verbose_name = "AI runtime settings"
        verbose_name_plural = "AI runtime settings"

    def __str__(self) -> str:
        return f"AI Runtime ({self.singleton_key})"

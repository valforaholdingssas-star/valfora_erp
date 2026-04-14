"""Models for LLM configuration (per deployment / tenant)."""

from django.db import models

from apps.common.models import BaseModel


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

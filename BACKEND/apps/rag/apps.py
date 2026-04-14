"""RAG: document chunks and embeddings for chat IA."""

from django.apps import AppConfig


class RagConfig(AppConfig):
    """Retrieval-augmented generation over CRM documents."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.rag"
    verbose_name = "RAG"

    def ready(self) -> None:
        from apps.rag import signals  # noqa: F401

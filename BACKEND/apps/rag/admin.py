"""Admin for RAG chunks."""

from django.contrib import admin

from apps.rag.models import DocumentChunk


@admin.register(DocumentChunk)
class DocumentChunkAdmin(admin.ModelAdmin):
    """Admin for document chunks."""

    list_display = ("document", "chunk_index", "embedding_model", "token_count", "updated_at")
    list_filter = ("embedding_model",)
    search_fields = ("text",)

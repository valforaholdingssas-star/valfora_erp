"""Chunked document embeddings for RAG."""

from django.db import models

from apps.common.models import BaseModel
from apps.crm.models import Document


class DocumentChunk(BaseModel):
    """Text segment of a CRM document with embedding vector (JSON list for portability)."""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="rag_chunks")
    chunk_index = models.PositiveIntegerField(db_index=True)
    text = models.TextField()
    embedding = models.JSONField(default=list)
    embedding_model = models.CharField(max_length=80, default="text-embedding-3-small")
    token_count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Document chunk"
        verbose_name_plural = "Document chunks"
        ordering = ["document_id", "chunk_index"]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "chunk_index"],
                name="rag_unique_document_chunk_index",
            ),
        ]
        indexes = [
            models.Index(fields=["document", "chunk_index"]),
        ]

    def __str__(self) -> str:
        return f"chunk {self.chunk_index} · {self.document_id}"

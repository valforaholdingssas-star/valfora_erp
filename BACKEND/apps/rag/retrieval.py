"""Top-K retrieval by cosine similarity (numpy; works on SQLite and PostgreSQL)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import numpy as np
from django.db.models import Q

from apps.crm.models import Document

from apps.rag.models import DocumentChunk

logger = logging.getLogger(__name__)


def _cosine(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=np.float64)
    vb = np.array(b, dtype=np.float64)
    na = np.linalg.norm(va)
    nb = np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def documents_for_contact(contact_id: UUID, ai_configuration_id: UUID | None = None) -> Any:
    """CRM documents tied to contact/deals + optional docs attached to selected AI agent."""
    q = Q(contact_id=contact_id) | Q(deal__contact_id=contact_id)
    if ai_configuration_id:
        q |= Q(ai_configuration_id=ai_configuration_id)
    return Document.objects.filter(is_active=True).filter(q).distinct()


def retrieve_relevant_chunks(
    *,
    contact_id: UUID,
    ai_configuration_id: UUID | None = None,
    query_embedding: list[float],
    top_k: int = 5,
) -> list[tuple[str, float]]:
    """
    Return list of (chunk_text, score) for the best matching chunks among contact documents.
    """
    if not query_embedding or top_k <= 0:
        return []
    doc_ids = list(
        documents_for_contact(contact_id=contact_id, ai_configuration_id=ai_configuration_id).values_list("id", flat=True)
    )
    if not doc_ids:
        return []
    chunks = list(
        DocumentChunk.objects.filter(document_id__in=doc_ids, is_active=True).only("id", "text", "embedding")
    )
    scored: list[tuple[str, float]] = []
    for ch in chunks:
        emb = ch.embedding
        if not isinstance(emb, list) or len(emb) != len(query_embedding):
            continue
        score = _cosine(query_embedding, emb)
        scored.append((ch.text, score))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]

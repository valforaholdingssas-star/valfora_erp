"""Index CRM documents into chunks + embeddings."""

from __future__ import annotations

import logging
import os

from django.db import transaction

from apps.crm.models import Document
from apps.rag.chunking import chunk_text
from apps.rag.embeddings import embed_texts
from apps.rag.models import DocumentChunk
from apps.rag.text_extract import extract_text_from_file

logger = logging.getLogger(__name__)

BATCH_EMBED = 16


def index_document(*, document_id) -> int:
    """
    Rebuild all chunks for a CRM document. Returns number of chunks stored.
    """
    try:
        doc = Document.objects.get(pk=document_id, is_active=True)
    except Document.DoesNotExist:
        return 0

    path = doc.file.path if doc.file else ""
    if not path:
        return 0

    text = extract_text_from_file(path, doc.file_type or "")
    if not text.strip():
        logger.info("No extractable text for document %s", document_id)
        DocumentChunk.objects.filter(document_id=doc.id).update(is_active=False)
        return 0

    pieces = chunk_text(text)
    if not pieces:
        return 0

    model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    with transaction.atomic():
        DocumentChunk.objects.filter(document_id=doc.id).delete()
        created = 0
        for start in range(0, len(pieces), BATCH_EMBED):
            batch = pieces[start : start + BATCH_EMBED]
            vectors = embed_texts(batch, model=model)
            rows = []
            for offset, (piece, vec) in enumerate(zip(batch, vectors)):
                idx = start + offset
                rows.append(
                    DocumentChunk(
                        document_id=doc.id,
                        chunk_index=idx,
                        text=piece[:12000],
                        embedding=list(vec),
                        embedding_model=model,
                        token_count=len(piece.split()),
                    )
                )
            DocumentChunk.objects.bulk_create(rows)
            created += len(rows)
    return created

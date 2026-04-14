"""Celery tasks for RAG indexing."""

import logging

from celery import shared_task

from apps.rag.services import index_document

logger = logging.getLogger(__name__)


@shared_task(name="rag.tasks.index_crm_document")
def index_crm_document(document_id: str) -> int:
    """Rebuild embeddings for a CRM document."""
    try:
        n = index_document(document_id=document_id)
        logger.info("Indexed document %s chunks=%s", document_id, n)
        return n
    except Exception as exc:  # noqa: BLE001
        logger.exception("index_crm_document failed: %s", exc)
        return 0

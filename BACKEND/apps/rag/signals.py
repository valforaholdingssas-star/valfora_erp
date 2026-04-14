"""Reindex RAG when CRM documents change."""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.crm.models import Document


@receiver(post_save, sender=Document)
def enqueue_rag_index_on_document_save(sender, instance: Document, **kwargs) -> None:
    """Queue embedding rebuild after upload/update."""
    if not instance.is_active or not instance.file:
        return

    def _enqueue() -> None:
        from apps.rag.tasks import index_crm_document

        index_crm_document.delay(str(instance.id))

    transaction.on_commit(_enqueue)

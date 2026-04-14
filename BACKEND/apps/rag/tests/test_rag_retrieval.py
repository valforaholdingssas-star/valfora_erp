"""RAG retrieval cosine ranking."""

import pytest
from django.core.files.base import ContentFile

from apps.crm.models import Contact, Document
from apps.rag.models import DocumentChunk
from apps.rag.retrieval import retrieve_relevant_chunks


@pytest.mark.django_db
def test_retrieve_ranks_by_similarity(admin_user):
    contact = Contact.objects.create(
        first_name="R",
        last_name="AG",
        email="rag@example.com",
        created_by=admin_user,
    )
    doc = Document.objects.create(
        contact=contact,
        name="test.txt",
        file=ContentFile(b"hello world", name="test.txt"),
        file_type="text/plain",
        uploaded_by=admin_user,
    )
    a = [1.0, 0.0, 0.0]
    b = [0.0, 1.0, 0.0]
    DocumentChunk.objects.create(document=doc, chunk_index=0, text="first", embedding=a)
    DocumentChunk.objects.create(document=doc, chunk_index=1, text="second", embedding=b)
    q = [0.99, 0.1, 0.0]
    out = retrieve_relevant_chunks(contact_id=contact.id, query_embedding=q, top_k=1)
    assert len(out) == 1
    assert out[0][0] == "first"

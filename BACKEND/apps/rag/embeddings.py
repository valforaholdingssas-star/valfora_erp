"""OpenAI embeddings helper."""

from __future__ import annotations

import logging
import os
from typing import Any

from openai import OpenAI

logger = logging.getLogger(__name__)


def embed_texts(texts: list[str], *, model: str | None = None) -> list[list[float]]:
    """Return embedding vectors for each non-empty text."""
    if not texts:
        return []
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    m = model or os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    client = OpenAI(api_key=api_key)
    resp = client.embeddings.create(model=m, input=texts)
    data = sorted(resp.data, key=lambda x: x.index)
    return [list(d.embedding) for d in data]


def embed_query(text: str, *, model: str | None = None) -> list[float]:
    """Single query embedding."""
    vecs = embed_texts([text], model=model)
    return vecs[0] if vecs else []

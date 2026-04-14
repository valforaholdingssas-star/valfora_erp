"""Split long text into overlapping chunks."""

from __future__ import annotations

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 120


def chunk_text(text: str, *, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Return non-empty text chunks."""
    t = (text or "").strip()
    if not t:
        return []
    if len(t) <= chunk_size:
        return [t]
    out: list[str] = []
    start = 0
    while start < len(t):
        end = min(start + chunk_size, len(t))
        piece = t[start:end].strip()
        if piece:
            out.append(piece)
        if end >= len(t):
            break
        start = end - overlap
        if start < 0:
            start = 0
    return out

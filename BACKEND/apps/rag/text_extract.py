"""Extract plain text from uploaded CRM files."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_text_from_file(path: str, file_type: str) -> str:
    """Best-effort text extraction for indexing."""
    p = Path(path)
    suffix = (p.suffix or "").lower()
    ft = (file_type or "").lower()

    if suffix == ".txt" or "text/plain" in ft:
        try:
            return p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""

    if suffix == ".pdf" or "pdf" in ft:
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(p))
            parts: list[str] = []
            for page in reader.pages:
                t = page.extract_text() or ""
                parts.append(t)
            return "\n".join(parts)
        except Exception as exc:  # noqa: BLE001
            logger.warning("PDF extract failed %s: %s", path, exc)
            return ""

    try:
        return p.read_text(encoding="utf-8", errors="replace")[:500_000]
    except OSError:
        return ""

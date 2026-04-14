"""Human handoff detection (keywords)."""

from __future__ import annotations

import re

# Español / inglés básicos; ampliar según negocio.
HANDOFF_KEYWORD_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(humano|persona|agente|operador|asesor|representante)\b", re.I),
    re.compile(r"\b(hablar con alguien|atenci[oó]n humana|no quiero (un )?bot)\b", re.I),
    re.compile(r"\b(human|agent|representative|real person)\b", re.I),
)


def text_requests_human_handoff(text: str) -> bool:
    """Return True if the user likely wants to speak with a human."""
    if not (text or "").strip():
        return False
    s = text.strip()
    return any(p.search(s) for p in HANDOFF_KEYWORD_PATTERNS)

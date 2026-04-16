"""LLM calls, moderation, and prompt building (RAG-lite: CRM + history)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from openai import OpenAI

from apps.ai_config.models import AIConfiguration
from apps.ai_config.runtime import resolve_openai_api_key, resolve_openai_moderation_disabled
from apps.chat.models import Message
from apps.crm.models import Contact

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CompletionResult:
    """OpenAI chat completion output + usage for auditing and quotas."""

    text: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


def get_default_ai_configuration() -> AIConfiguration | None:
    """Return the active default AI configuration, if any."""
    return (
        AIConfiguration.objects.filter(is_active=True, is_default=True)
        .order_by("-updated_at")
        .first()
    )


def resolve_ai_configuration_for_conversation(conv) -> AIConfiguration | None:
    """Use per-conversation config when set; otherwise the default configuration."""
    if getattr(conv, "ai_configuration_id", None):
        cfg = (
            AIConfiguration.objects.filter(
                pk=conv.ai_configuration_id,
                is_active=True,
            )
            .first()
        )
        if cfg:
            return cfg
    return get_default_ai_configuration()


def build_openai_messages(*, trigger_message: Message, config: AIConfiguration) -> list[dict[str, Any]]:
    """Build chat messages: system + CRM context + recent thread (RAG-lite)."""
    conv = trigger_message.conversation
    contact = Contact.objects.select_related("company").get(pk=conv.contact_id)

    lines: list[str] = [
        f"Contacto: {contact.first_name} {contact.last_name} · email: {contact.email}",
        f"Etapa: {contact.lifecycle_stage} · intención: {contact.intent_level}",
    ]
    if contact.company_id:
        lines.append(f"Empresa: {contact.company.name}")
    if (contact.notes or "").strip():
        notes = (contact.notes or "")[:4000]
        lines.append(f"Notas CRM:\n{notes}")

    context_block = "\n".join(lines)
    system = (
        (config.system_prompt or "").strip()
        or "Eres un asistente comercial profesional. Responde en español, de forma breve y útil."
    )
    rag_block = ""
    if getattr(config, "rag_enabled", True):
        try:
            from apps.rag.embeddings import embed_query
            from apps.rag.retrieval import retrieve_relevant_chunks

            q_text = (trigger_message.content or "")[:2000]
            if q_text.strip():
                qe = embed_query(q_text)
                top_k = max(1, min(20, int(getattr(config, "rag_top_k", 5) or 5)))
                scored = retrieve_relevant_chunks(
                    contact_id=contact.id,
                    query_embedding=qe,
                    top_k=top_k,
                )
                if scored:
                    lines_rag = [f"[sim {score:.3f}] {text[:1200]}" for text, score in scored]
                    rag_block = "\n--- Documentos CRM (RAG) ---\n" + "\n".join(lines_rag)
        except Exception as exc:  # noqa: BLE001
            logger.warning("RAG retrieval skipped: %s", exc)

    system_full = f"{system}\n\n--- Contexto CRM ---\n{context_block}"
    if rag_block:
        system_full = f"{system_full}\n{rag_block}"

    qs = (
        Message.objects.filter(conversation=conv, is_active=True)
        .order_by("-created_at")[: config.max_history_messages]
    )
    history = list(qs)
    history.reverse()

    messages: list[dict[str, Any]] = [{"role": "system", "content": system_full}]
    for m in history:
        if m.id == trigger_message.id:
            continue
        role = _map_sender_to_openai_role(m.sender_type)
        content = (m.content or "").strip()
        if not content:
            continue
        messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": (trigger_message.content or "").strip()})
    return messages


def _map_sender_to_openai_role(sender_type: str) -> str:
    if sender_type == "contact":
        return "user"
    if sender_type in ("user", "ai_bot"):
        return "assistant"
    return "assistant"


def build_openai_test_messages(*, config: AIConfiguration, user_message: str) -> list[dict[str, Any]]:
    """System + user only (no CRM contact, no RAG) for admin test calls."""
    system = (
        (config.system_prompt or "").strip()
        or "Eres un asistente comercial profesional. Responde en español, de forma breve y útil."
    )
    text = (user_message or "").strip()[:8000]
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": text},
    ]


def generate_chat_completion(*, messages: list[dict[str, Any]], config: AIConfiguration) -> CompletionResult:
    """Call OpenAI Chat Completions (server-side only)."""
    api_key = resolve_openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=config.llm_model,
        messages=messages,
        temperature=float(config.temperature),
        max_tokens=int(config.max_tokens),
    )
    choice = response.choices[0]
    text = (choice.message.content or "").strip()
    usage = response.usage
    pt = getattr(usage, "prompt_tokens", None) or 0
    ct = getattr(usage, "completion_tokens", None) or 0
    tt = getattr(usage, "total_tokens", None) or (pt + ct)
    return CompletionResult(
        text=text,
        prompt_tokens=int(pt),
        completion_tokens=int(ct),
        total_tokens=int(tt),
    )


def moderate_openai_text(text: str) -> tuple[bool, dict[str, Any]]:
    """
    Returns (allowed_to_send, audit_dict).
    If moderation is disabled or API key missing, allows and records skip reason.
    """
    if resolve_openai_moderation_disabled():
        return True, {"moderation": "disabled_by_settings"}

    api_key = resolve_openai_api_key()
    if not api_key:
        return True, {"moderation": "skipped_no_api_key"}

    client = OpenAI(api_key=api_key)
    result = client.moderations.create(input=text, model="omni-moderation-latest")
    first = result.results[0]
    flagged = bool(first.flagged)
    audit: dict[str, Any] = {"moderation_flagged": flagged}
    return not flagged, audit

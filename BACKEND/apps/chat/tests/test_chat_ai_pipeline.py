"""AI reply pipeline (Celery eager + mocked OpenAI)."""

from unittest.mock import patch

import pytest

from apps.ai_config.services import CompletionResult
from apps.chat.models import Conversation, Message
from apps.chat.tasks import generate_ai_reply_for_message
from apps.crm.models import Contact, Deal


@pytest.mark.django_db
@patch("apps.rag.retrieval.retrieve_relevant_chunks", return_value=[])
@patch("apps.rag.embeddings.embed_query", return_value=[0.0] * 1536)
@patch("apps.chat.tasks.try_reserve_conversation_tokens", return_value=True)
@patch("apps.chat.tasks.moderate_openai_text", return_value=(True, {}))
@patch(
    "apps.chat.tasks.generate_chat_completion",
    return_value=CompletionResult(
        text="Gracias por escribirnos.",
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
    ),
)
def test_ai_reply_creates_bot_message(mock_rag, mock_emb, mock_reserve, mock_mod, mock_llm, admin_user):
    """Inbound contact message with ai_mode on produces an ai_bot reply."""
    contact = Contact.objects.create(
        first_name="Lead",
        last_name="AI",
        email="leadai@example.com",
        created_by=admin_user,
    )
    deal = Deal.objects.create(title="AI pipeline deal", contact=contact, assigned_to=admin_user)
    conv = Conversation.objects.get(deal=deal, channel="internal")
    conv.assigned_to = admin_user
    conv.ai_mode_enabled = True
    conv.save(update_fields=["assigned_to", "ai_mode_enabled", "updated_at"])
    inbound = Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Hola, necesito información",
        message_type="text",
        status="delivered",
    )
    generate_ai_reply_for_message(str(inbound.id))
    mock_llm.assert_called_once()
    bot = Message.objects.filter(conversation=conv, sender_type="ai_bot", is_ai_generated=True).first()
    assert bot is not None
    assert "Gracias" in bot.content

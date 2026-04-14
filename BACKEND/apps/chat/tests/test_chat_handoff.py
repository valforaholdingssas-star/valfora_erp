"""Human handoff keyword detection."""

import pytest

from apps.chat.models import Conversation, Message
from apps.crm.models import Contact, Deal


@pytest.mark.django_db
def test_handoff_keyword_sets_conversation_flag(admin_user):
    contact = Contact.objects.create(
        first_name="Lead",
        last_name="H",
        email="handoff@example.com",
        created_by=admin_user,
    )
    deal = Deal.objects.create(title="Handoff deal", contact=contact, assigned_to=admin_user)
    conv = Conversation.objects.get(deal=deal, channel="internal")
    conv.assigned_to = admin_user
    conv.ai_mode_enabled = True
    conv.save(update_fields=["assigned_to", "ai_mode_enabled", "updated_at"])
    Message.objects.create(
        conversation=conv,
        sender_type="contact",
        content="Por favor conéctame con un agente humano",
        message_type="text",
        status="delivered",
    )
    conv.refresh_from_db()
    assert conv.human_handoff_requested is True
    assert conv.human_handoff_at is not None

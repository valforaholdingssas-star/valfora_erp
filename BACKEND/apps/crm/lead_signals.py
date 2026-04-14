"""Lightweight CRM lead signals."""

from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.chat.models import Message
from apps.crm.lead_engine import LeadEngine


@receiver(post_save, sender=Message)
def complete_followups_on_contact_reply(sender, instance: Message, created: bool, **kwargs) -> None:
    """Auto-complete pending whatsapp/follow-up activities when contact replies."""

    if not created or instance.sender_type != "contact":
        return
    conv = instance.conversation
    if conv.channel != "whatsapp" or not conv.contact_id:
        return
    engine = LeadEngine()
    if not engine.config.auto_complete_activities_on_reply:
        return
    engine.auto_complete_pending_activities(conv.contact)

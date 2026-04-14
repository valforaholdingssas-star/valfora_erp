"""CRM signal handlers."""

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from apps.chat.models import Conversation
from apps.crm.models import Activity, Deal, Contact

# Ensure signal modules are registered.
from apps.crm import lead_signals, pipeline_signals  # noqa: F401


@receiver(post_save, sender=Activity)
def activity_updates_contact_last_touch(sender, instance: Activity, **kwargs) -> None:
    """Refresh contact last_contact_date when an activity is logged."""
    if not instance.contact_id:
        return
    Contact.objects.filter(pk=instance.contact_id).update(
        last_contact_date=timezone.now(),
        updated_at=timezone.now(),
    )


@receiver(post_save, sender=Deal)
def create_internal_chat_for_new_deal(sender, instance: Deal, created: bool, **kwargs) -> None:
    """Ensure each deal has an internal chat thread right after creation."""
    if not created:
        return
    Conversation.objects.get_or_create(
        contact=instance.contact,
        deal=instance,
        channel="internal",
        defaults={
            "assigned_to": instance.assigned_to or instance.contact.assigned_to,
            "status": "active",
        },
    )

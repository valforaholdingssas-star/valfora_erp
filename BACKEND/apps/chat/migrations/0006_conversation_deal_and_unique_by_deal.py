from django.db import migrations, models
from django.db.models import Q


def backfill_conversation_deal(apps, schema_editor):
    Conversation = apps.get_model("chat", "Conversation")
    Deal = apps.get_model("crm", "Deal")

    for conv in Conversation.objects.all().iterator():
        if conv.deal_id:
            continue
        deal = (
            Deal.objects.filter(contact_id=conv.contact_id, is_active=True)
            .order_by("-updated_at", "-created_at")
            .first()
        )
        if not deal:
            deal = Deal.objects.filter(contact_id=conv.contact_id).order_by("-updated_at", "-created_at").first()
        if deal:
            conv.deal_id = deal.id
            conv.save(update_fields=["deal"])


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0002_pipelineautomationconfig_deal_is_stale_deal_source_and_more"),
        ("chat", "0005_message_chat_unique_non_empty_whatsapp_message_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversation",
            name="deal",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.CASCADE,
                related_name="conversations",
                to="crm.deal",
            ),
        ),
        migrations.RunPython(backfill_conversation_deal, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="conversation",
            name="chat_unique_contact_channel",
        ),
        migrations.AddConstraint(
            model_name="conversation",
            constraint=models.UniqueConstraint(
                condition=Q(("deal__isnull", False)),
                fields=("deal", "channel"),
                name="chat_unique_deal_channel",
            ),
        ),
    ]

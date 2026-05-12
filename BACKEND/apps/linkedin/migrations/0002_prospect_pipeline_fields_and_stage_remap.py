from django.db import migrations, models


def remap_old_funnel_stages(apps, schema_editor):
    LinkedInProspect = apps.get_model("linkedin", "LinkedInProspect")
    old_to_new = {
        "prospect_identified": "contacted",
        "invitation_sent": "contacted",
        "connection_accepted": "high_interest",
        "first_message_sent": "contacted",
        "in_conversation": "high_interest",
        "meeting_scheduled": "meeting_scheduling",
        "client": "high_interest",
    }
    for old, new in old_to_new.items():
        LinkedInProspect.objects.filter(funnel_stage=old).update(funnel_stage=new)


class Migration(migrations.Migration):
    dependencies = [
        ("linkedin", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="linkedinprospect",
            name="conversation_summary",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="linkedinprospect",
            name="opportunity_currency",
            field=models.CharField(blank=True, default="USD", max_length=8),
        ),
        migrations.AddField(
            model_name="linkedinprospect",
            name="opportunity_value",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="linkedinprospect",
            name="product_interest",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AlterField(
            model_name="linkedinprospect",
            name="funnel_stage",
            field=models.CharField(
                choices=[
                    ("contacted", "Contactado"),
                    ("low_interest", "Interés bajo"),
                    ("high_interest", "Interés alto"),
                    ("meeting_scheduling", "En agendamiento de reunión"),
                    ("proposal_sent", "Propuesta enviada"),
                    ("no_response", "No contesta"),
                    ("discarded", "Descartado"),
                ],
                db_index=True,
                default="contacted",
                max_length=64,
            ),
        ),
        migrations.RunPython(remap_old_funnel_stages, migrations.RunPython.noop),
    ]

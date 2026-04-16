from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0002_pipelineautomationconfig_deal_is_stale_deal_source_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="is_global_knowledge",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Disponible como contexto global en RAG para cualquier conversación.",
            ),
        ),
    ]

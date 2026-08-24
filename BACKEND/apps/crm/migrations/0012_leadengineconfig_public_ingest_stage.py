"""Add dedicated pipeline stage for public web lead ingest."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0011_leadengineconfig_allowed_origins"),
    ]

    operations = [
        migrations.AddField(
            model_name="leadengineconfig",
            name="public_ingest_pipeline_stage",
            field=models.CharField(blank=True, default="web", max_length=50),
        ),
    ]

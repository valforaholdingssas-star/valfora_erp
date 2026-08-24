"""Add allowed origins whitelist for public lead ingest."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0010_leadengineconfig_public_ingest"),
    ]

    operations = [
        migrations.AddField(
            model_name="leadengineconfig",
            name="public_ingest_allowed_origins",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

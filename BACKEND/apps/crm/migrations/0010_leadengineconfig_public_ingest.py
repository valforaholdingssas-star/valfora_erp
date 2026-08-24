"""Add public lead ingest settings to LeadEngineConfig."""

from django.db import migrations, models

import apps.whatsapp.models


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0009_deal_call_and_call_desk"),
    ]

    operations = [
        migrations.AddField(
            model_name="leadengineconfig",
            name="public_ingest_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="leadengineconfig",
            name="public_ingest_api_key",
            field=apps.whatsapp.models.EncryptedTextField(blank=True),
        ),
    ]

from django.db import migrations, models

import apps.ai_config.models


class Migration(migrations.Migration):

    dependencies = [
        ("ai_config", "0006_airuntimesettings_google_calendar"),
    ]

    operations = [
        migrations.AddField(
            model_name="airuntimesettings",
            name="linkedin_max_invitations_per_day",
            field=models.PositiveIntegerField(default=40),
        ),
        migrations.AddField(
            model_name="airuntimesettings",
            name="linkedin_max_messages_per_day",
            field=models.PositiveIntegerField(default=50),
        ),
        migrations.AddField(
            model_name="airuntimesettings",
            name="linkedin_max_search_results_per_day",
            field=models.PositiveIntegerField(default=1000),
        ),
        migrations.AddField(
            model_name="airuntimesettings",
            name="unipile_api_base_url",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="airuntimesettings",
            name="unipile_api_key",
            field=apps.ai_config.models.EncryptedTextField(blank=True),
        ),
        migrations.AddField(
            model_name="airuntimesettings",
            name="unipile_link_callback_url",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="airuntimesettings",
            name="unipile_webhook_secret",
            field=apps.ai_config.models.EncryptedTextField(blank=True),
        ),
    ]

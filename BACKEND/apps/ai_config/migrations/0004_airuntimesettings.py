import uuid

from django.db import migrations, models

import apps.ai_config.models


class Migration(migrations.Migration):

    dependencies = [
        ("ai_config", "0003_rag_and_ai_rag_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="AIRuntimeSettings",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_active", models.BooleanField(default=True)),
                ("singleton_key", models.CharField(default="default", max_length=32, unique=True)),
                ("openai_api_key", apps.ai_config.models.EncryptedTextField(blank=True)),
                ("openai_embedding_model", models.CharField(default="text-embedding-3-small", max_length=120)),
                ("openai_moderation_disabled", models.BooleanField(default=False)),
            ],
            options={
                "verbose_name": "AI runtime settings",
                "verbose_name_plural": "AI runtime settings",
            },
        ),
    ]

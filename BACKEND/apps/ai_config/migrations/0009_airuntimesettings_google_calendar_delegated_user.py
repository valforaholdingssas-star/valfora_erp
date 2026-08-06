from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ai_config", "0008_expand_profile_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="airuntimesettings",
            name="google_calendar_delegated_user",
            field=models.EmailField(
                blank=True,
                help_text="Workspace user to impersonate (Domain-Wide Delegation) for invites and Meet.",
                max_length=254,
            ),
        ),
    ]

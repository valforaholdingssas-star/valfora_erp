from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ai_config", "0004_airuntimesettings"),
    ]

    operations = [
        migrations.AddField(
            model_name="aiconfiguration",
            name="objective",
            field=models.TextField(blank=True, help_text="Objetivo principal de la IA en las conversaciones."),
        ),
        migrations.AddField(
            model_name="aiconfiguration",
            name="role",
            field=models.CharField(blank=True, help_text="Rol que debe asumir la IA.", max_length=160),
        ),
        migrations.AddField(
            model_name="aiconfiguration",
            name="style",
            field=models.CharField(blank=True, help_text="Estilo de redacción deseado.", max_length=160),
        ),
        migrations.AddField(
            model_name="aiconfiguration",
            name="tone",
            field=models.CharField(blank=True, help_text="Tono de comunicación esperado.", max_length=120),
        ),
        migrations.AddField(
            model_name="airuntimesettings",
            name="global_ai_mode_enabled",
            field=models.BooleanField(default=False),
        ),
    ]

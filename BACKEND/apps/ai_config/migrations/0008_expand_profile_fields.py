from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ai_config", "0007_airuntimesettings_linkedin_unipile_runtime"),
    ]

    operations = [
        migrations.AlterField(
            model_name="aiconfiguration",
            name="role",
            field=models.TextField(blank=True, help_text="Rol que debe asumir la IA."),
        ),
        migrations.AlterField(
            model_name="aiconfiguration",
            name="style",
            field=models.TextField(blank=True, help_text="Estilo de redacción deseado."),
        ),
        migrations.AlterField(
            model_name="aiconfiguration",
            name="tone",
            field=models.TextField(blank=True, help_text="Tono de comunicación esperado."),
        ),
    ]

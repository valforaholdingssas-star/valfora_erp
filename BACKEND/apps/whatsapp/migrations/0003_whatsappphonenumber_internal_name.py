from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("whatsapp", "0002_whatsappphonenumber_default_assigned_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsappphonenumber",
            name="internal_name",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]

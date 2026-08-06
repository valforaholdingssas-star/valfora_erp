from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("calendar_app", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="calendarbookingdraft",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending_selection", "Pending selection"),
                    ("pending_email", "Pending email"),
                    ("confirmed", "Confirmed"),
                    ("cancelled", "Cancelled"),
                ],
                db_index=True,
                default="pending_selection",
                max_length=24,
            ),
        ),
    ]

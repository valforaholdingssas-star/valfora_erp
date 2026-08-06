from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("calendar_app", "0002_calendarbookingdraft_pending_email"),
    ]

    operations = [
        migrations.AlterField(
            model_name="calendarbookingdraft",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending_day", "Pending day"),
                    ("pending_period", "Pending period"),
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

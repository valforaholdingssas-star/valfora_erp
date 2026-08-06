from django.db import migrations


def register_closed_chat_follow_up_task(apps, schema_editor):
    interval_model = apps.get_model("django_celery_beat", "IntervalSchedule")
    periodic_task_model = apps.get_model("django_celery_beat", "PeriodicTask")

    interval, _ = interval_model.objects.get_or_create(
        every=15,
        period="minutes",
    )

    periodic_task_model.objects.update_or_create(
        name="CRM | avanzar chats WhatsApp cerrados a realizar llamada",
        defaults={
            "task": "crm.tasks.advance_closed_whatsapp_conversations",
            "interval": interval,
            "enabled": True,
        },
    )


def unregister_closed_chat_follow_up_task(apps, schema_editor):
    periodic_task_model = apps.get_model("django_celery_beat", "PeriodicTask")
    periodic_task_model.objects.filter(
        name="CRM | avanzar chats WhatsApp cerrados a realizar llamada",
        task="crm.tasks.advance_closed_whatsapp_conversations",
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0005_pipelinestage_deal_business_notes_and_more"),
        ("django_celery_beat", "0018_improve_crontab_helptext"),
    ]

    operations = [
        migrations.RunPython(register_closed_chat_follow_up_task, unregister_closed_chat_follow_up_task),
    ]

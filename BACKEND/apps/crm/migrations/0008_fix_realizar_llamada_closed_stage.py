from django.db import migrations


def fix_follow_up_stage_flags(apps, schema_editor):
    PipelineStage = apps.get_model("crm", "PipelineStage")
    PipelineStage.objects.filter(key="realizar_llamada").update(
        is_closed_stage=True,
        is_won_stage=False,
        is_lost_stage=False,
        is_active=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0007_seed_pipeline_stage_defaults"),
    ]

    operations = [
        migrations.RunPython(fix_follow_up_stage_flags, migrations.RunPython.noop),
    ]

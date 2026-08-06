from django.db import migrations


def seed_pipeline_defaults(apps, schema_editor):
    PipelineStage = apps.get_model("crm", "PipelineStage")
    PipelineAutomationConfig = apps.get_model("crm", "PipelineAutomationConfig")

    defaults = [
        ("new_lead", "Nuevo lead", "#3b82f6", "rgba(59, 130, 246, 0.14)", False, False, False),
        ("contacted", "Contactado", "#0ea5e9", "rgba(14, 165, 233, 0.14)", False, False, False),
        ("realizar_llamada", "Realizar llamada", "#f59e0b", "rgba(245, 158, 11, 0.14)", False, False, False),
        ("qualified", "Calificado", "#8b5cf6", "rgba(139, 92, 246, 0.14)", False, False, False),
        ("qualification", "Calificación (legacy)", "#64748b", "rgba(100, 116, 139, 0.14)", False, False, False),
        ("proposal", "Propuesta", "#f97316", "rgba(249, 115, 22, 0.14)", False, False, False),
        ("negotiation", "Negociación", "#ef4444", "rgba(239, 68, 68, 0.14)", False, False, False),
        ("closed_won", "Ganado", "#22c55e", "rgba(34, 197, 94, 0.14)", True, True, False),
        ("closed_lost", "Perdido", "#94a3b8", "rgba(148, 163, 184, 0.18)", True, False, True),
    ]

    for position, (key, name, accent, tint, is_closed, is_won, is_lost) in enumerate(defaults):
        PipelineStage.objects.update_or_create(
            key=key,
            defaults={
                "name": name,
                "position": position,
                "accent_color": accent,
                "tint_color": tint,
                "is_closed_stage": is_closed,
                "is_won_stage": is_won,
                "is_lost_stage": is_lost,
                "is_active": True,
            },
        )

    cfg = PipelineAutomationConfig.objects.order_by("created_at").first()
    if cfg:
        cfg.closed_chat_stage_key = "realizar_llamada"
        cfg.save(update_fields=["closed_chat_stage_key", "updated_at"])
    else:
        PipelineAutomationConfig.objects.create(closed_chat_stage_key="realizar_llamada")


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0006_register_closed_chat_follow_up_task"),
    ]

    operations = [
        migrations.RunPython(seed_pipeline_defaults, migrations.RunPython.noop),
    ]

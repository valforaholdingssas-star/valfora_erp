"""Repair wrongly auto-moved non-WhatsApp deals."""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.chat.models import Conversation
from apps.crm.models import Deal, DealStageHistory
from apps.crm.pipeline_automation import PipelineAutomationService


class Command(BaseCommand):
    help = "Revert deals incorrectly moved by the closed WhatsApp window automation when the deal source is not WhatsApp."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply changes. Without this flag the command runs in dry-run mode.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options["apply"])
        target_stage = PipelineAutomationService.get_follow_up_stage_key()

        candidates = (
            Deal.objects.filter(
                is_active=True,
                stage=target_stage,
            )
            .exclude(source="whatsapp")
            .prefetch_related("stage_history", "conversations")
        )

        reverted = 0
        reopened = 0
        skipped = 0

        for deal in candidates:
            latest_history = deal.stage_history.order_by("-created_at").first()
            if not latest_history or latest_history.trigger != "chat_window_closed" or latest_history.to_stage != target_stage:
                skipped += 1
                continue

            previous_stage = PipelineAutomationService.normalize_stage(latest_history.from_stage or "") or "qualified"

            if not apply_changes:
                self.stdout.write(
                    f"DRY RUN deal={deal.id} title={deal.title!r} source={deal.source} revert {target_stage} -> {previous_stage}"
                )
                reverted += 1
                continue

            with transaction.atomic():
                deal.stage = previous_stage
                deal.save(update_fields=["stage", "updated_at"])
                DealStageHistory.objects.create(
                    deal=deal,
                    from_stage=target_stage,
                    to_stage=previous_stage,
                    moved_by=None,
                    trigger="manual",
                    notes="Reversión automática: el deal no era origen WhatsApp y fue movido incorrectamente por cierre de ventana.",
                )
                reverted += 1

                conversation = (
                    Conversation.objects.filter(
                        deal=deal,
                        channel="whatsapp",
                        is_active=True,
                        status="archived",
                    )
                    .order_by("-updated_at")
                    .first()
                )
                if conversation:
                    conversation.status = "active"
                    conversation.closed_at = None
                    conversation.save(update_fields=["status", "closed_at", "updated_at"])
                    reopened += 1

        mode = "APPLY" if apply_changes else "DRY RUN"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} complete. reverted={reverted} reopened={reopened} skipped={skipped} target_stage={target_stage}"
            )
        )

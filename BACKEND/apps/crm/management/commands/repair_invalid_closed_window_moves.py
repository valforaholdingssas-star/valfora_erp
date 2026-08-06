"""Repair deals wrongly moved by the closed WhatsApp window automation."""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.chat.models import Conversation
from apps.crm.models import Deal, DealStageHistory
from apps.crm.pipeline_automation import PipelineAutomationService


class Command(BaseCommand):
    help = (
        "Revert deals moved to the follow-up call stage by the closed WhatsApp window automation "
        "when they do not meet the strict WhatsApp-origin and real-inbound criteria."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply changes. Without this flag the command runs in dry-run mode.",
        )

    def _latest_whatsapp_conversation(self, deal):
        return (
            deal.conversations.filter(is_active=True, channel="whatsapp")
            .order_by("-updated_at")
            .first()
        )

    def _is_invalid_move(self, deal, conversation, target_stage, now):
        if deal.source != "whatsapp":
            return True, "el deal no es origen WhatsApp"
        if conversation is None:
            return True, "no existe conversación WhatsApp asociada"
        if conversation.last_inbound_message_at is None:
            return True, "la conversación no tiene inbound real"
        if not conversation.customer_service_window_expires:
            return True, "la conversación no tiene vencimiento de ventana"
        if conversation.customer_service_window_expires >= now:
            return True, "la ventana de WhatsApp no estaba vencida"
        latest_history = deal.stage_history.order_by("-created_at").first()
        if not latest_history:
            return True, "no hay historial de etapa"
        if latest_history.trigger != "chat_window_closed" or latest_history.to_stage != target_stage:
            return True, "el último movimiento no fue generado por el cierre automático"
        return False, ""

    def handle(self, *args, **options):
        apply_changes = bool(options["apply"])
        target_stage = PipelineAutomationService.get_follow_up_stage_key()
        now = timezone.now()

        candidates = Deal.objects.filter(is_active=True, stage=target_stage).prefetch_related("stage_history", "conversations")

        reverted = 0
        reopened = 0
        skipped = 0

        for deal in candidates:
            conversation = self._latest_whatsapp_conversation(deal)
            invalid, reason = self._is_invalid_move(deal, conversation, target_stage, now)
            if not invalid:
                skipped += 1
                continue

            latest_history = deal.stage_history.order_by("-created_at").first()
            previous_stage = PipelineAutomationService.normalize_stage(getattr(latest_history, "from_stage", "") or "") or "qualified"

            if not apply_changes:
                self.stdout.write(
                    f"DRY RUN deal={deal.id} title={deal.title!r} source={deal.source} revert {target_stage} -> {previous_stage} reason={reason}"
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
                    notes=f"Reversión automática del cierre WhatsApp: {reason}.",
                )
                reverted += 1

                if conversation and conversation.status == "archived":
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

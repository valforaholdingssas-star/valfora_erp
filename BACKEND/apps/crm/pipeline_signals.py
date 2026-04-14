"""Signals for automated deal stage progression."""

from __future__ import annotations

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.chat.models import Message
from apps.crm.models import Activity, Deal, Document
from apps.crm.pipeline_automation import PipelineAutomationService
from apps.finance.models import Contract


def _get_primary_open_deal(contact_id):
    return (
        Deal.objects.filter(contact_id=contact_id, is_active=True)
        .exclude(stage__in=["closed_won", "closed_lost"])
        .order_by("-updated_at")
        .first()
    )


@receiver(post_save, sender=Message)
def move_deal_on_first_agent_response(sender, instance: Message, created: bool, **kwargs) -> None:
    """Move deal from new_lead to contacted on first outbound agent response."""

    if not created or instance.sender_type != "user":
        return
    conv = instance.conversation
    if conv.channel != "whatsapp" or not conv.contact_id:
        return

    cfg = PipelineAutomationService.get_config()
    if not cfg.auto_move_on_first_response:
        return

    has_prev_user_msg = Message.objects.filter(
        conversation_id=instance.conversation_id,
        sender_type="user",
        is_active=True,
    ).exclude(id=instance.id).exists()
    if has_prev_user_msg:
        return

    deal = _get_primary_open_deal(conv.contact_id)
    if not deal:
        return
    PipelineAutomationService.move_stage(
        deal=deal,
        to_stage="contacted",
        trigger="first_response",
        moved_by=None,
        notes="Primera respuesta del agente en WhatsApp.",
    )


@receiver(post_save, sender=Activity)
def move_deal_on_meeting_scheduled(sender, instance: Activity, created: bool, **kwargs) -> None:
    """Move deal from contacted to qualified when meeting/call is created."""

    if not created:
        return
    if instance.activity_type not in {"meeting", "call"}:
        return
    if not instance.deal_id:
        return

    cfg = PipelineAutomationService.get_config()
    if not cfg.auto_move_on_meeting:
        return

    PipelineAutomationService.move_stage(
        deal=instance.deal,
        to_stage="qualified",
        trigger="meeting_scheduled",
        moved_by=None,
        notes="Actividad de reunión/llamada programada.",
    )


@receiver(post_save, sender=Document)
def move_deal_on_proposal_sent(sender, instance: Document, created: bool, **kwargs) -> None:
    """Move deal from qualified to proposal on proposal-like document upload."""

    if not created or not instance.deal_id:
        return

    cfg = PipelineAutomationService.get_config()
    if not cfg.auto_move_on_proposal:
        return

    probe = f"{instance.name} {instance.file_type}".lower()
    if "proposal" not in probe and "propuesta" not in probe and "quote" not in probe and "cotizacion" not in probe:
        return

    PipelineAutomationService.move_stage(
        deal=instance.deal,
        to_stage="proposal",
        trigger="proposal_sent",
        moved_by=None,
        notes="Documento de propuesta/cotización cargado.",
    )


@receiver(post_save, sender=Contract)
def move_deal_on_contract_created(sender, instance: Contract, created: bool, **kwargs) -> None:
    """Move deal from proposal to negotiation when a contract is created."""

    if not created or not instance.deal_id:
        return

    cfg = PipelineAutomationService.get_config()
    if not cfg.auto_move_on_contract:
        return

    PipelineAutomationService.move_stage(
        deal=instance.deal,
        to_stage="negotiation",
        trigger="contract_created",
        moved_by=None,
        notes="Contrato creado para el deal.",
    )


@receiver(pre_save, sender=Contract)
def move_deal_on_contract_signed(sender, instance: Contract, **kwargs) -> None:
    """Move deal to closed_won when contract changes to active."""

    if not instance.pk or not instance.deal_id:
        return

    cfg = PipelineAutomationService.get_config()
    if not cfg.auto_move_on_contract_signed:
        return

    previous = Contract.objects.filter(pk=instance.pk).only("status").first()
    if not previous or previous.status == instance.status:
        return
    if instance.status != "active":
        return

    PipelineAutomationService.move_stage(
        deal=instance.deal,
        to_stage="closed_won",
        trigger="contract_signed",
        moved_by=None,
        notes="Contrato marcado como activo/firmado.",
    )

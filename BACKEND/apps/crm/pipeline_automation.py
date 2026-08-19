"""Pipeline automation helpers for Deal stage transitions."""

from __future__ import annotations

from dataclasses import dataclass

from apps.common.audit import write_audit_log
from apps.crm.models import Deal, DealStageHistory, PipelineAutomationConfig, PipelineStage

ALIASES = {"qualification": "qualified"}


@dataclass
class StageMoveResult:
    moved: bool
    reason: str = ""


class PipelineAutomationService:
    """Service for safe automated/manual stage transitions."""

    @staticmethod
    def get_config() -> PipelineAutomationConfig:
        cfg = PipelineAutomationConfig.objects.filter(is_active=True).order_by("-updated_at").first()
        if cfg:
            return cfg
        return PipelineAutomationConfig.objects.create()

    @staticmethod
    def get_stages():
        return list(PipelineStage.objects.filter(is_active=True).order_by("position", "created_at"))

    @classmethod
    def get_stage_map(cls) -> dict[str, PipelineStage]:
        return {stage.key: stage for stage in cls.get_stages()}

    @classmethod
    def get_closed_stage_keys(cls) -> set[str]:
        return {stage.key for stage in cls.get_stages() if stage.is_closed_stage}

    @classmethod
    def get_follow_up_stage_key(cls) -> str:
        cfg = cls.get_config()
        return cls.normalize_stage(cfg.closed_chat_stage_key or "realizar_llamada")

    @staticmethod
    def normalize_stage(stage: str) -> str:
        return ALIASES.get(stage, stage)

    @classmethod
    def can_move(cls, from_stage: str, to_stage: str) -> bool:
        from_stage = cls.normalize_stage(from_stage)
        to_stage = cls.normalize_stage(to_stage)
        stage_map = cls.get_stage_map()
        if from_stage == to_stage:
            return False
        from_stage_obj = stage_map.get(from_stage)
        to_stage_obj = stage_map.get(to_stage)
        if not from_stage_obj or not to_stage_obj:
            return False
        if from_stage_obj.is_closed_stage:
            return False
        if to_stage_obj.is_closed_stage:
            return True
        open_sequence = [stage.key for stage in cls.get_stages() if not stage.is_closed_stage]
        if from_stage not in open_sequence or to_stage not in open_sequence:
            return False
        return open_sequence.index(to_stage) == open_sequence.index(from_stage) + 1

    @classmethod
    def move_stage(
        cls,
        *,
        deal: Deal,
        to_stage: str,
        trigger: str,
        moved_by=None,
        notes: str = "",
    ) -> StageMoveResult:
        to_stage = cls.normalize_stage(to_stage)
        current = cls.normalize_stage(deal.stage)
        stage_map = cls.get_stage_map()
        if to_stage not in stage_map:
            return StageMoveResult(moved=False, reason=f"Etapa destino desconocida: {to_stage}")
        if current == to_stage:
            return StageMoveResult(moved=True, reason="already_in_stage")
        # Manual canvas/table moves can jump to any existing stage (including custom ones).
        # Automated moves remain constrained by can_move().
        is_manual = trigger == "manual"
        if not is_manual and not cls.can_move(current, to_stage):
            return StageMoveResult(
                moved=False,
                reason=f"No se puede mover automáticamente de {current} a {to_stage}.",
            )

        raw_from = deal.stage
        update_fields = ["stage", "is_stale", "updated_at"]
        deal.stage = to_stage
        if stage_map[to_stage].is_closed_stage:
            deal.is_stale = False

        follow_up_key = cls.get_follow_up_stage_key()
        if to_stage == follow_up_key:
            from apps.crm.call_desk import resolve_call_stage_assignee

            assignee = resolve_call_stage_assignee()
            if assignee and deal.assigned_to_id != assignee.id:
                deal.assigned_to = assignee
                update_fields.append("assigned_to")

        deal.save(update_fields=update_fields)

        DealStageHistory.objects.create(
            deal=deal,
            from_stage=raw_from,
            to_stage=to_stage,
            moved_by=moved_by,
            trigger=trigger,
            notes=notes,
        )
        write_audit_log(
            user=moved_by,
            action="update",
            instance=deal,
            changes={"from_stage": raw_from, "to_stage": to_stage, "trigger": trigger, "automated": moved_by is None},
        )
        # Business summary is only for WhatsApp-origin deals entering the call stage.
        if to_stage == follow_up_key and (deal.source or "").strip().lower() == "whatsapp":
            from apps.crm.tasks import generate_business_summary_for_deal

            generate_business_summary_for_deal.delay(str(deal.id))
        return StageMoveResult(moved=True)

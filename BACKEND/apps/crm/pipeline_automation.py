"""Pipeline automation helpers for Deal stage transitions."""

from __future__ import annotations

from dataclasses import dataclass

from apps.common.audit import write_audit_log
from apps.crm.models import Deal, DealStageHistory, PipelineAutomationConfig

STAGE_SEQUENCE = [
    "new_lead",
    "contacted",
    "qualified",
    "proposal",
    "negotiation",
    "closed_won",
]
TERMINAL_STAGES = {"closed_won", "closed_lost"}
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
    def normalize_stage(stage: str) -> str:
        return ALIASES.get(stage, stage)

    @classmethod
    def can_move(cls, from_stage: str, to_stage: str) -> bool:
        from_stage = cls.normalize_stage(from_stage)
        to_stage = cls.normalize_stage(to_stage)
        if from_stage == to_stage:
            return False
        if from_stage in TERMINAL_STAGES:
            return False
        if to_stage == "closed_lost":
            return True
        if from_stage not in STAGE_SEQUENCE or to_stage not in STAGE_SEQUENCE:
            return False
        return STAGE_SEQUENCE.index(to_stage) == STAGE_SEQUENCE.index(from_stage) + 1

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
        if not cls.can_move(current, to_stage):
            return StageMoveResult(moved=False, reason=f"Invalid transition {current} -> {to_stage}")

        raw_from = deal.stage
        deal.stage = to_stage
        if to_stage == "closed_lost":
            deal.is_stale = False
        deal.save(update_fields=["stage", "is_stale", "updated_at"])

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
        return StageMoveResult(moved=True)

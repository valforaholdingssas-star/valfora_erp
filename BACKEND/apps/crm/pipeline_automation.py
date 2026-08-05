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
        keys = {stage.key for stage in cls.get_stages() if stage.is_closed_stage}
        return keys or {"closed_won", "closed_lost"}

    @classmethod
    def get_follow_up_stage_key(cls) -> str:
        config = cls.get_config()
        key = cls.normalize_stage(config.closed_chat_stage_key or "realizar_llamada")
        stage_map = cls.get_stage_map()
        if key in stage_map:
            return key
        return "realizar_llamada"

    @staticmethod
    def normalize_stage(stage: str) -> str:
        return ALIASES.get(stage, stage)

    @classmethod
    def can_move(cls, from_stage: str, to_stage: str) -> bool:
        from_stage = cls.normalize_stage(from_stage)
        to_stage = cls.normalize_stage(to_stage)
        if from_stage == to_stage:
            return False
        if from_stage in cls.get_closed_stage_keys():
            return False
        if to_stage in cls.get_closed_stage_keys():
            return True
        stage_map = cls.get_stage_map()
        if from_stage not in stage_map or to_stage not in stage_map:
            return False
        ordered_open_stages = [stage.key for stage in cls.get_stages() if not stage.is_closed_stage]
        if from_stage not in ordered_open_stages or to_stage not in ordered_open_stages:
            return False
        return ordered_open_stages.index(to_stage) == ordered_open_stages.index(from_stage) + 1

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
        from apps.crm.tasks import generate_business_summary_for_deal

        to_stage = cls.normalize_stage(to_stage)
        current = cls.normalize_stage(deal.stage)
        is_manual = trigger == "manual"
        closed_stage_keys = cls.get_closed_stage_keys()
        if not is_manual and not cls.can_move(current, to_stage):
            return StageMoveResult(moved=False, reason=f"Invalid transition {current} -> {to_stage}")
        if is_manual and current in closed_stage_keys and to_stage not in closed_stage_keys:
            return StageMoveResult(moved=False, reason=f"Invalid transition {current} -> {to_stage}")

        raw_from = deal.stage
        deal.stage = to_stage
        if to_stage in closed_stage_keys:
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
        if to_stage == cls.get_follow_up_stage_key():
            generate_business_summary_for_deal.delay(str(deal.id))
        return StageMoveResult(moved=True)

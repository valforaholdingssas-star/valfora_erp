"""Assignment strategies for automated lead routing."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Count, Q

from apps.crm.models import LeadEngineConfig

User = get_user_model()

OPEN_DEAL_STAGES = {"new_lead", "contacted", "qualified", "qualification", "proposal", "negotiation"}


class AssignmentEngine:
    """Resolve assignee for inbound leads based on active configuration."""

    @staticmethod
    def assign(config: LeadEngineConfig, whatsapp_phone_number=None):  # noqa: ANN001
        strategy = config.assignment_strategy
        if strategy == "specific_user" and config.assignment_specific_user_id:
            return config.assignment_specific_user
        if strategy == "by_phone_number" and whatsapp_phone_number and whatsapp_phone_number.default_assigned_user_id:
            return whatsapp_phone_number.default_assigned_user
        if strategy == "least_busy":
            return AssignmentEngine._least_busy(config)
        if strategy == "round_robin":
            return AssignmentEngine._round_robin(config)
        return AssignmentEngine._fallback_user(config)

    @staticmethod
    def _assignment_pool(config: LeadEngineConfig):
        pool = config.assignment_users.filter(is_active=True)
        if pool.exists():
            return pool.order_by("id")
        return User.objects.filter(is_active=True, role__in=["admin", "collaborator", "super_admin"]).order_by("id")

    @staticmethod
    def _fallback_user(config: LeadEngineConfig):
        return AssignmentEngine._assignment_pool(config).first()

    @staticmethod
    def _round_robin(config: LeadEngineConfig):
        users = list(AssignmentEngine._assignment_pool(config))
        if not users:
            return None
        key = f"crm:lead_engine:rr:{config.id}"
        idx = cache.get(key, 0)
        user = users[idx % len(users)]
        cache.set(key, (idx + 1) % len(users), timeout=None)
        return user

    @staticmethod
    def _least_busy(config: LeadEngineConfig):
        users = AssignmentEngine._assignment_pool(config)
        return (
            users.annotate(
                active_deals=Count(
                    "crm_deals_assigned",
                    filter=Q(crm_deals_assigned__is_active=True, crm_deals_assigned__stage__in=OPEN_DEAL_STAGES),
                ),
                active_conversations=Count(
                    "chat_conversations_assigned",
                    filter=Q(chat_conversations_assigned__is_active=True, chat_conversations_assigned__status="active"),
                ),
            )
            .order_by("active_deals", "active_conversations", "id")
            .first()
        )

"""Lead Engine service: orchestrates WhatsApp inbound messages into CRM entities."""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.common.audit import write_audit_log
from apps.crm.assignment_engine import AssignmentEngine
from apps.crm.models import Activity, Contact, Deal, LeadEngineConfig


def normalize_phone(raw_phone: str) -> str:
    """Normalize phone for matching using last 10 digits strategy."""

    digits = re.sub(r"\D", "", raw_phone or "")
    if digits.startswith("00"):
        digits = digits[2:]
    return digits


class LeadEngine:
    """Main orchestrator for inbound WhatsApp lead lifecycle."""

    def __init__(self, config: LeadEngineConfig | None = None):
        self.config = config or self.get_active_config()

    @staticmethod
    def get_active_config() -> LeadEngineConfig:
        cfg = LeadEngineConfig.objects.filter(is_active=True).order_by("-updated_at").first()
        if cfg:
            return cfg
        return LeadEngineConfig.objects.create()

    @transaction.atomic
    def process_inbound_whatsapp_message(
        self,
        *,
        phone_number: str,
        sender_name: str,
        message_content: str,
        message_type: str,
        whatsapp_message_id: str,
        whatsapp_phone_number,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Process inbound WhatsApp payload and sync CRM + chat records atomically."""

        from apps.chat.models import Conversation, Message

        # Idempotency for duplicated webhook deliveries
        existing = Message.objects.filter(whatsapp_message_id=whatsapp_message_id).first()
        if existing:
            conv = existing.conversation
            return {
                "contact": conv.contact,
                "is_new_contact": False,
                "deal": conv.deal
                or Deal.objects.filter(contact=conv.contact, is_active=True)
                .exclude(stage__in=["closed_won", "closed_lost"])
                .first(),
                "is_new_deal": False,
                "conversation": conv,
                "message": existing,
                "activity": None,
                "notifications_sent": 0,
            }

        contact, is_new_contact = self.find_or_create_contact(
            phone_number=phone_number,
            sender_name=sender_name,
            source="whatsapp",
            whatsapp_phone_number=whatsapp_phone_number,
        )

        contact.last_contact_date = timezone.now()
        contact.save(update_fields=["last_contact_date", "updated_at"])

        if self.config.auto_complete_activities_on_reply:
            self.auto_complete_pending_activities(contact)

        deal, is_new_deal = self.find_or_create_deal(contact=contact, source="whatsapp")

        if deal:
            conv, _ = Conversation.objects.get_or_create(
                deal=deal,
                channel="whatsapp",
                defaults={
                    "contact": contact,
                    "status": "active",
                    "assigned_to": contact.assigned_to,
                    "whatsapp_phone_number": whatsapp_phone_number,
                },
            )
        else:
            conv, _ = Conversation.objects.get_or_create(
                contact=contact,
                deal=None,
                channel="whatsapp",
                defaults={
                    "status": "active",
                    "assigned_to": contact.assigned_to,
                    "whatsapp_phone_number": whatsapp_phone_number,
                },
            )
        conv.last_inbound_message_at = timezone.now()
        conv.customer_service_window_expires = timezone.now() + timedelta(hours=24)
        if whatsapp_phone_number and not conv.whatsapp_phone_number_id:
            conv.whatsapp_phone_number = whatsapp_phone_number
        if contact.assigned_to_id and not conv.assigned_to_id:
            conv.assigned_to = contact.assigned_to
        conv.unread_count = (conv.unread_count or 0) + 1
        conv.save(
            update_fields=[
                "last_inbound_message_at",
                "customer_service_window_expires",
                "whatsapp_phone_number",
                "assigned_to",
                "unread_count",
                "updated_at",
            ]
        )

        msg = Message.objects.create(
            conversation=conv,
            sender_type="contact",
            content=message_content,
            message_type=message_type if message_type in dict(Message.TYPE_CHOICES) else "text",
            whatsapp_message_id=whatsapp_message_id,
            status="delivered",
            metadata={"raw": metadata or {}, "from": normalize_phone(phone_number)},
        )

        activity = None
        if self.config.auto_create_follow_up and deal:
            activity = self.create_follow_up_activity(
                contact=contact,
                deal=deal,
                activity_type="whatsapp",
                message_preview=message_content,
            )

        if is_new_contact:
            write_audit_log(
                user=None,
                action="create",
                instance=contact,
                changes={"source": "whatsapp", "auto": True},
            )
        if is_new_deal and deal:
            write_audit_log(
                user=None,
                action="create",
                instance=deal,
                changes={"source": "whatsapp", "auto": True},
            )

        return {
            "contact": contact,
            "is_new_contact": is_new_contact,
            "deal": deal,
            "is_new_deal": is_new_deal,
            "conversation": conv,
            "message": msg,
            "activity": activity,
            "notifications_sent": 0,
        }

    def find_or_create_contact(
        self,
        *,
        phone_number: str,
        sender_name: str,
        source: str,
        whatsapp_phone_number=None,
    ) -> tuple[Contact, bool]:
        """Find by normalized whatsapp/phone and create if not found."""

        digits = normalize_phone(phone_number)
        suffix = digits[-10:] if len(digits) >= 10 else digits
        exact = Contact.objects.filter(is_active=True).filter(
            Q(whatsapp_number=digits) | Q(phone_number=digits)
        ).first()
        if exact:
            self.update_contact_from_whatsapp_profile(exact, {"name": sender_name})
            return exact, False

        candidates = Contact.objects.filter(is_active=True)
        for contact in candidates:
            c_wa = normalize_phone(contact.whatsapp_number)
            c_phone = normalize_phone(contact.phone_number)
            for candidate in (c_wa, c_phone):
                tail = candidate[-10:] if len(candidate) >= 10 else candidate
                if candidate and (candidate == digits or tail == suffix):
                    self.update_contact_from_whatsapp_profile(contact, {"name": sender_name})
                    return contact, False

        if not self.config.auto_create_contact:
            fallback = Contact.objects.filter(is_active=True).order_by("-created_at").first()
            if fallback:
                return fallback, False

        assignee = self.assign_responsible(source=source, whatsapp_phone_number=whatsapp_phone_number)
        pieces = (sender_name or "Nuevo Contacto").strip().split(" ", 1)
        first_name = pieces[0] if pieces and pieces[0] else "Nuevo"
        last_name = pieces[1] if len(pieces) > 1 else "Contacto"
        contact = Contact.objects.create(
            first_name=first_name,
            last_name=last_name,
            email=f"wa-{digits or 'unknown'}@auto.local",
            phone_number=digits,
            whatsapp_number=digits,
            source=source if source in dict(Contact.SOURCE_CHOICES) else "other",
            lifecycle_stage=self.config.default_lifecycle_stage,
            intent_level=self.config.default_intent_level,
            assigned_to=assignee,
            last_contact_date=timezone.now(),
            created_by=None,
        )
        return contact, True

    def find_or_create_deal(self, *, contact: Contact, source: str) -> tuple[Deal | None, bool]:
        """Find active deal or create one for contact depending on config."""

        active = (
            Deal.objects.filter(contact=contact, is_active=True)
            .exclude(stage__in=["closed_won", "closed_lost"])
            .order_by("-updated_at")
            .first()
        )
        if active:
            return active, False
        if not self.config.auto_create_deal:
            return None, False

        stage = self.config.default_deal_pipeline_stage
        if stage == "qualification":
            stage = "qualified"
        title = self.config.default_deal_title_template.format(
            contact_name=f"{contact.first_name} {contact.last_name}".strip(),
            phone=contact.whatsapp_number or contact.phone_number,
        )
        deal = Deal.objects.create(
            title=title,
            contact=contact,
            company=contact.company,
            stage=stage,
            probability=10,
            assigned_to=contact.assigned_to,
            source=source if source in dict(Deal.SOURCE_CHOICES) else "other",
        )
        from apps.crm.models import DealStageHistory

        DealStageHistory.objects.create(
            deal=deal,
            from_stage="",
            to_stage=stage,
            moved_by=None,
            trigger="lead_created",
            notes="Deal creado automáticamente por Lead Engine",
        )
        return deal, True

    def create_follow_up_activity(
        self,
        *,
        contact: Contact,
        deal: Deal | None,
        activity_type: str,
        message_preview: str,
    ) -> Activity:
        """Create response-time follow-up activity from inbound whatsapp."""

        due = timezone.now() + timedelta(minutes=self.config.max_response_time_minutes)
        return Activity.objects.create(
            contact=contact,
            deal=deal,
            activity_type=activity_type if activity_type in dict(Activity.TYPE_CHOICES) else "whatsapp",
            subject="Primer contacto via WhatsApp" if activity_type == "whatsapp" else "Seguimiento WhatsApp",
            description=(message_preview or "")[:200],
            due_date=due,
            is_completed=False,
            assigned_to=contact.assigned_to,
            created_by=None,
        )

    def auto_complete_pending_activities(self, contact: Contact) -> int:
        """Mark follow-up/whatsapp pending activities as completed when contact replies."""

        now = timezone.now()
        qs = Activity.objects.filter(
            contact=contact,
            is_active=True,
            is_completed=False,
            activity_type__in=["follow_up", "whatsapp"],
        )
        total = qs.count()
        if total:
            qs.update(is_completed=True, completed_at=now, updated_at=now)
        return total

    def assign_responsible(self, *, source: str, whatsapp_phone_number=None):  # noqa: ANN001
        """Resolve responsible user following configured strategy."""

        del source
        return AssignmentEngine.assign(self.config, whatsapp_phone_number=whatsapp_phone_number)

    def update_contact_from_whatsapp_profile(self, contact: Contact, wa_profile_data: dict[str, Any]) -> Contact:
        """Update only empty contact fields from WhatsApp profile data."""

        name = (wa_profile_data.get("name") or "").strip()
        changed = False
        if name:
            pieces = name.split(" ", 1)
            if not contact.first_name:
                contact.first_name = pieces[0]
                changed = True
            if len(pieces) > 1 and not contact.last_name:
                contact.last_name = pieces[1]
                changed = True
        if changed:
            contact.save(update_fields=["first_name", "last_name", "updated_at"])
        return contact

"""Lead Engine service: orchestrates WhatsApp inbound messages into CRM entities."""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.ai_config.runtime import resolve_global_ai_mode_enabled
from apps.common.audit import write_audit_log
from apps.crm.assignment_engine import AssignmentEngine
from apps.crm.models import Activity, Company, Contact, Deal, LeadEngineConfig


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

        from apps.chat.models import Message
        from apps.chat.services import resolve_whatsapp_conversation
        from apps.chat.services import _whatsapp_media_id_from_raw
        from apps.chat.tasks import fetch_whatsapp_media_for_message

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

        conv, _ = resolve_whatsapp_conversation(
            contact,
            deal=deal,
            assigned_to=contact.assigned_to,
            whatsapp_phone_number=whatsapp_phone_number,
            ai_mode_enabled=resolve_global_ai_mode_enabled(),
            status="active",
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
        media_message_type = message_type if message_type in dict(Message.TYPE_CHOICES) else "text"
        media_id = _whatsapp_media_id_from_raw(metadata or {}, media_message_type)
        if media_id and media_message_type != "text":
            fetch_whatsapp_media_for_message.delay(str(msg.id), media_id)

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

    @transaction.atomic
    def process_public_form_lead(
        self,
        *,
        email: str,
        first_name: str,
        last_name: str,
        phone_number: str = "",
        message: str = "",
        source: str = "website",
        company_name: str = "",
        deal_title: str = "",
        create_deal: bool | None = None,
        external_id: str = "",
        custom_fields: dict[str, Any] | None = None,
        intent_level: str = "",
    ) -> dict[str, Any]:
        """Create or update a CRM lead from an external web form submission."""

        contact, is_new_contact = self.find_or_create_web_contact(
            email=email,
            first_name=first_name,
            last_name=last_name,
            phone_number=phone_number,
            source=source,
            company_name=company_name,
            external_id=external_id,
            custom_fields=custom_fields or {},
            intent_level=intent_level,
        )

        contact.last_contact_date = timezone.now()
        contact.save(update_fields=["last_contact_date", "updated_at"])

        should_create_deal = self.config.auto_create_deal if create_deal is None else create_deal
        deal = None
        is_new_deal = False
        if should_create_deal:
            deal, is_new_deal = self.find_or_create_open_deal(
                contact=contact,
                source=source,
                title_override=deal_title or None,
                pipeline_stage=self.resolve_public_ingest_stage(),
            )

        if deal:
            deal = self.refresh_web_deal_visibility(
                deal=deal,
                contact=contact,
                source=source,
                deal_title=deal_title,
            )

        activity = None
        if self.config.auto_create_follow_up:
            activity = self.create_web_form_activity(
                contact=contact,
                deal=deal,
                message=message,
            )

        if is_new_contact:
            write_audit_log(
                user=None,
                action="create",
                instance=contact,
                changes={"source": source, "auto": True, "channel": "public_ingest"},
            )
        if is_new_deal and deal:
            write_audit_log(
                user=None,
                action="create",
                instance=deal,
                changes={"source": source, "auto": True, "channel": "public_ingest"},
            )

        return {
            "contact": contact,
            "is_new_contact": is_new_contact,
            "deal": deal,
            "is_new_deal": is_new_deal,
            "activity": activity,
        }

    def find_or_create_web_contact(
        self,
        *,
        email: str,
        first_name: str,
        last_name: str,
        phone_number: str,
        source: str,
        company_name: str,
        external_id: str,
        custom_fields: dict[str, Any],
        intent_level: str,
    ) -> tuple[Contact, bool]:
        """Find contact by external id, email or phone; create when allowed."""

        email_norm = (email or "").strip().lower()
        if external_id:
            existing = Contact.objects.filter(
                is_active=True,
                custom_fields__external_lead_id=external_id,
            ).first()
            if existing:
                self._update_web_contact(
                    existing,
                    first_name=first_name,
                    last_name=last_name,
                    phone_number=phone_number,
                    company_name=company_name,
                    custom_fields=custom_fields,
                    intent_level=intent_level,
                )
                return existing, False

        if email_norm:
            existing = Contact.objects.filter(is_active=True, email__iexact=email_norm).first()
            if existing:
                self._update_web_contact(
                    existing,
                    first_name=first_name,
                    last_name=last_name,
                    phone_number=phone_number,
                    company_name=company_name,
                    custom_fields=custom_fields,
                    intent_level=intent_level,
                    external_id=external_id,
                )
                return existing, False

        digits = normalize_phone(phone_number)
        if digits:
            suffix = digits[-10:] if len(digits) >= 10 else digits
            for contact in Contact.objects.filter(is_active=True):
                for candidate in (
                    normalize_phone(contact.phone_number),
                    normalize_phone(contact.whatsapp_number),
                ):
                    tail = candidate[-10:] if len(candidate) >= 10 else candidate
                    if candidate and (candidate == digits or tail == suffix):
                        self._update_web_contact(
                            contact,
                            first_name=first_name,
                            last_name=last_name,
                            phone_number=phone_number,
                            company_name=company_name,
                            custom_fields=custom_fields,
                            intent_level=intent_level,
                            external_id=external_id,
                            email=email_norm,
                        )
                        return contact, False

        if not self.config.auto_create_contact:
            fallback = Contact.objects.filter(is_active=True).order_by("-created_at").first()
            if fallback:
                return fallback, False

        assignee = self.assign_responsible(source=source, whatsapp_phone_number=None)
        merged_fields = dict(custom_fields or {})
        if external_id:
            merged_fields["external_lead_id"] = external_id
        company = self._resolve_company(company_name)
        contact = Contact.objects.create(
            first_name=(first_name or "Nuevo").strip() or "Nuevo",
            last_name=(last_name or "Lead").strip() or "Lead",
            email=email_norm,
            phone_number=digits,
            company=company,
            source=source if source in dict(Contact.SOURCE_CHOICES) else "website",
            lifecycle_stage=self.config.default_lifecycle_stage,
            intent_level=intent_level if intent_level in dict(Contact.INTENT_CHOICES) else self.config.default_intent_level,
            assigned_to=assignee,
            last_contact_date=timezone.now(),
            custom_fields=merged_fields,
            created_by=None,
        )
        return contact, True

    def _update_web_contact(
        self,
        contact: Contact,
        *,
        first_name: str,
        last_name: str,
        phone_number: str,
        company_name: str,
        custom_fields: dict[str, Any],
        intent_level: str,
        external_id: str = "",
        email: str = "",
    ) -> Contact:
        """Fill empty fields on an existing contact from a web form resubmission."""

        changed_fields: list[str] = []
        if first_name and not contact.first_name:
            contact.first_name = first_name.strip()
            changed_fields.append("first_name")
        if last_name and not contact.last_name:
            contact.last_name = last_name.strip()
            changed_fields.append("last_name")
        digits = normalize_phone(phone_number)
        if digits and not contact.phone_number:
            contact.phone_number = digits
            changed_fields.append("phone_number")
        if email and (not contact.email or contact.email.endswith("@auto.local")):
            contact.email = email
            changed_fields.append("email")
        if intent_level and intent_level in dict(Contact.INTENT_CHOICES):
            contact.intent_level = intent_level
            changed_fields.append("intent_level")
        company = self._resolve_company(company_name)
        if company and not contact.company_id:
            contact.company = company
            changed_fields.append("company")
        merged = dict(contact.custom_fields or {})
        merged.update(custom_fields or {})
        if external_id:
            merged["external_lead_id"] = external_id
        if merged != (contact.custom_fields or {}):
            contact.custom_fields = merged
            changed_fields.append("custom_fields")
        if changed_fields:
            changed_fields.append("updated_at")
            contact.save(update_fields=changed_fields)
        return contact

    def _resolve_company(self, company_name: str) -> Company | None:
        """Return existing company by name or create a lightweight record."""

        label = (company_name or "").strip()
        if not label:
            return None
        existing = Company.objects.filter(is_active=True, name__iexact=label).first()
        if existing:
            return existing
        return Company.objects.create(name=label)

    def resolve_public_ingest_stage(self) -> str:
        """Return configured pipeline column for leads submitted via public web forms."""

        from apps.crm.pipeline_automation import PipelineAutomationService

        configured = (self.config.public_ingest_pipeline_stage or "web").strip()
        normalized = PipelineAutomationService.normalize_stage(configured)
        stage_map = PipelineAutomationService.get_stage_map()
        if normalized in stage_map:
            return normalized
        fallback = PipelineAutomationService.normalize_stage(self.config.default_deal_pipeline_stage)
        if fallback in stage_map:
            return fallback
        return normalized

    def _assign_deal_to_stage(
        self,
        *,
        deal: Deal,
        to_stage: str,
        notes: str,
    ) -> Deal:
        """Move deal directly to a pipeline stage (including custom columns)."""

        from apps.crm.models import DealStageHistory
        from apps.crm.pipeline_automation import PipelineAutomationService

        target = PipelineAutomationService.normalize_stage(to_stage)
        current = PipelineAutomationService.normalize_stage(deal.stage)
        if current == target:
            return deal
        if target not in PipelineAutomationService.get_stage_map():
            return deal
        deal.stage = target
        deal.save(update_fields=["stage", "updated_at"])
        DealStageHistory.objects.create(
            deal=deal,
            from_stage=current,
            to_stage=target,
            moved_by=None,
            trigger="lead_created",
            notes=notes,
        )
        return deal

    def _build_deal_title(self, *, contact: Contact, source: str, title_override: str | None = None) -> str:
        """Build a human-readable deal title based on lead source."""

        override = (title_override or "").strip()
        if override:
            return override
        contact_name = f"{contact.first_name} {contact.last_name}".strip() or contact.email
        if source == "website":
            return f"Lead Web - {contact_name}"
        return self.config.default_deal_title_template.format(
            contact_name=contact_name,
            phone=contact.phone_number or contact.whatsapp_number or contact.email,
        )

    def refresh_web_deal_visibility(
        self,
        *,
        deal: Deal,
        contact: Contact,
        source: str,
        deal_title: str = "",
    ) -> Deal:
        """Keep web-ingested deals easy to find in the pipeline."""

        if source != "website":
            return deal

        update_fields: list[str] = ["updated_at"]
        if deal.source != "website":
            deal.source = "website"
            update_fields.append("source")
        expected_title = self._build_deal_title(contact=contact, source=source, title_override=deal_title or None)
        if deal_title or "WhatsApp" in deal.title or deal.title.startswith("Lead WhatsApp"):
            deal.title = expected_title
            update_fields.append("title")
        if update_fields:
            deal.save(update_fields=update_fields)
        target_stage = self.resolve_public_ingest_stage()
        if deal.stage != target_stage:
            deal = self._assign_deal_to_stage(
                deal=deal,
                to_stage=target_stage,
                notes="Lead ubicado en columna de formulario web",
            )
        return deal

    def find_or_create_open_deal(
        self,
        *,
        contact: Contact,
        source: str,
        title_override: str | None = None,
        pipeline_stage: str | None = None,
    ) -> tuple[Deal | None, bool]:
        """Return an open deal for the contact or create one for inbound web leads."""

        from apps.crm.models import DealStageHistory
        from apps.crm.pipeline_automation import PipelineAutomationService

        closed_stage_keys = PipelineAutomationService.get_closed_stage_keys()
        active = (
            Deal.objects.filter(contact=contact, is_active=True)
            .exclude(stage__in=closed_stage_keys)
            .order_by("-updated_at", "-created_at")
            .first()
        )
        if active:
            return active, False
        if not self.config.auto_create_deal:
            return None, False

        stage = PipelineAutomationService.normalize_stage(
            pipeline_stage or self.config.default_deal_pipeline_stage,
        )
        title = self._build_deal_title(contact=contact, source=source, title_override=title_override)
        deal = Deal.objects.create(
            title=title,
            contact=contact,
            company=contact.company,
            stage=stage,
            probability=10,
            assigned_to=contact.assigned_to,
            source=source if source in dict(Deal.SOURCE_CHOICES) else "website",
        )
        DealStageHistory.objects.create(
            deal=deal,
            from_stage="",
            to_stage=stage,
            moved_by=None,
            trigger="lead_created",
            notes="Deal creado automáticamente desde formulario web",
        )
        return deal, True

    def create_web_form_activity(
        self,
        *,
        contact: Contact,
        deal: Deal | None,
        message: str,
    ) -> Activity:
        """Create a follow-up activity for a web form submission."""

        due = timezone.now() + timedelta(minutes=self.config.max_response_time_minutes)
        preview = (message or "Lead recibido desde formulario externo.").strip()
        return Activity.objects.create(
            contact=contact,
            deal=deal,
            activity_type="follow_up",
            subject="Lead desde formulario web",
            description=preview[:2000],
            due_date=due,
            is_completed=False,
            assigned_to=contact.assigned_to,
            created_by=None,
        )

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
        """Find an active deal for the current open chat session or create a fresh one."""

        from apps.chat.models import Conversation
        from apps.crm.pipeline_automation import PipelineAutomationService

        closed_stage_keys = PipelineAutomationService.get_closed_stage_keys()
        open_conversation = (
            Conversation.objects.filter(
                contact=contact,
                channel="whatsapp",
                is_active=True,
            )
            .exclude(status="archived")
            .exclude(deal__isnull=True)
            .order_by("-updated_at", "-created_at")
            .first()
        )
        if open_conversation and open_conversation.deal_id:
            active = (
                Deal.objects.filter(pk=open_conversation.deal_id, is_active=True)
                .exclude(stage__in=closed_stage_keys)
                .first()
            )
            if active:
                return active, False
        if not self.config.auto_create_deal:
            return None, False

        stage = PipelineAutomationService.normalize_stage(self.config.default_deal_pipeline_stage)
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

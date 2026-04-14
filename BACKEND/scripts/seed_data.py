#!/usr/bin/env python3
"""
Optional seed data for local/demo. Run from repo backend root:

  DJANGO_SETTINGS_MODULE=config.settings.development python scripts/seed_data.py

Environment:
  SEED_DEMO=1 — also create a demo company + contact (idempotent by email).

Creates a default AI configuration if none exists. Superuser creation is left to
``createsuperuser`` or deployment automation.
"""

from __future__ import annotations

import os
import sys

import django
from django.db.utils import OperationalError

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from apps.ai_config.models import AIConfiguration  # noqa: E402


def seed_ai_config() -> None:
    if AIConfiguration.objects.filter(is_default=True).exists():
        print("Default AIConfiguration already exists; skip.")
        return
    AIConfiguration.objects.create(
        name="Default",
        is_default=True,
        system_prompt="Eres un asistente profesional del equipo comercial. Responde en español, con claridad y brevedad.",
        llm_model="gpt-4o-mini",
        temperature=0.7,
        max_tokens=512,
        max_history_messages=20,
        moderation_enabled=True,
        rag_enabled=True,
        rag_top_k=5,
    )
    print("Created default AIConfiguration.")


def seed_demo_crm() -> None:
    from apps.crm.models import Company, Contact

    if Company.objects.filter(name="Demo Corp").exists():
        print("Demo company already exists; skip CRM demo.")
        return
    company = Company.objects.create(name="Demo Corp", city="Bogotá", country="CO")
    Contact.objects.create(
        first_name="Demo",
        last_name="Lead",
        email="demo.lead@example.local",
        company=company,
        lifecycle_stage="new_lead",
        intent_level="warm",
    )
    print("Created demo company and contact.")


def run() -> None:
    seed_ai_config()
    if os.getenv("SEED_DEMO", "").lower() in ("1", "true", "yes"):
        seed_demo_crm()


if __name__ == "__main__":
    try:
        run()
    except OperationalError as exc:
        print(
            "Database unavailable or migrations not applied. Run: python manage.py migrate",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc

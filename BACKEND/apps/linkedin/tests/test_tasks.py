"""Task tests for LinkedIn module."""

from django.test import TestCase

from apps.linkedin.tasks import (
    _extract_chat_unread_map,
    _frequency_delta,
    _jitter_minutes_for_search,
    _next_execution_at,
    _is_due,
    linkedin_reconcile_read_states,
)


class LinkedInTaskTests(TestCase):
    """Small unit tests for scheduling rules."""

    def test_is_due_with_no_last_executed(self):
        class Obj:
            last_executed_at = None
            frequency = "daily"

        self.assertTrue(_is_due(Obj()))

    def test_extract_chat_unread_map_from_count(self):
        payload = {"items": [{"chat_id": "chat_1", "unread_count": 3}, {"chat_id": "chat_2", "unread_count": 0}]}
        result = _extract_chat_unread_map(payload)
        self.assertEqual(result, {"chat_1": True, "chat_2": False})

    def test_extract_chat_unread_map_from_flags(self):
        payload = {
            "results": [
                {"id": "a", "unread": True},
                {"id": "b", "last_message_read": True},
                {"id": "c", "last_message_read": False},
            ]
        }
        result = _extract_chat_unread_map(payload)
        self.assertEqual(result, {"a": True, "b": False, "c": True})

    def test_reconcile_task_executes_without_accounts(self):
        # Should not fail when there are no active LinkedIn accounts.
        linkedin_reconcile_read_states()

    def test_jitter_range(self):
        class Obj:
            id = "abc"

        value = _jitter_minutes_for_search(Obj())
        self.assertGreaterEqual(value, -30)
        self.assertLessEqual(value, 30)

    def test_frequency_delta_daily(self):
        self.assertEqual(_frequency_delta("daily").days, 1)

    def test_next_execution_at_uses_jitter(self):
        from django.utils import timezone

        class Obj:
            id = "abc"
            frequency = "daily"
            created_at = timezone.now()
            last_executed_at = created_at

        next_at = _next_execution_at(Obj())
        self.assertTrue(next_at > Obj.created_at)

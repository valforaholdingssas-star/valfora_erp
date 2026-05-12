"""Webhook tests for LinkedIn module."""

import json
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse


class LinkedInWebhookTests(TestCase):
    """Ensure webhook auth and enqueue behavior."""

    @override_settings(UNIPILE_WEBHOOK_SECRET="secret123")
    def test_rejects_invalid_secret(self):
        url = reverse("linkedin-unipile-webhook")
        response = self.client.post(url, data=json.dumps({"event": "message_received"}), content_type="application/json")
        self.assertEqual(response.status_code, 403)

    @override_settings(UNIPILE_WEBHOOK_SECRET="secret123")
    @patch("apps.linkedin.webhooks.handle_new_message.delay")
    def test_accepts_and_dispatches_event(self, delay_mock):
        url = reverse("linkedin-unipile-webhook")
        response = self.client.post(
            url,
            data=json.dumps({"event": "message_received", "event_id": "evt_1", "account_id": "acc_1"}),
            content_type="application/json",
            HTTP_UNIPILE_AUTH="secret123",
        )
        self.assertEqual(response.status_code, 200)
        delay_mock.assert_called_once()


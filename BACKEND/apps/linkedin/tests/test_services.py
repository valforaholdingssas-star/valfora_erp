"""Service tests for LinkedIn module."""

from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from apps.linkedin.services import LinkedInLimiter, LinkedInRateLimited


class LinkedInLimiterTests(TestCase):
    """Validate internal daily quota controls."""

    def setUp(self):
        cache.clear()

    @override_settings(LINKEDIN_MAX_MESSAGES_PER_DAY=2)
    def test_message_quota(self):
        limiter = LinkedInLimiter()
        limiter.consume_message("acc_1")
        limiter.consume_message("acc_1")
        with self.assertRaises(LinkedInRateLimited):
            limiter.consume_message("acc_1")

    @patch("apps.linkedin.services.requests.request")
    @override_settings(UNIPILE_API_BASE_URL="https://unipile.test/api/v1", UNIPILE_API_KEY="abc")
    def test_request_passes_headers(self, req_mock):
        req_mock.return_value.status_code = 200
        req_mock.return_value.content = b"{}"
        req_mock.return_value.json.return_value = {}
        from apps.linkedin.services import UnipileService

        UnipileService()._request("GET", "/accounts/x")
        req_mock.assert_called()


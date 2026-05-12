"""Viewset tests for LinkedIn module."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class LinkedInViewsetTests(TestCase):
    """Smoke tests for LinkedIn API access."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(email="admin@test.com", password="test12345", role="super_admin")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_account_status_endpoint(self):
        resp = self.client.get("/api/v1/linkedin/accounts/status/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("connected", resp.data)

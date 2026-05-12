"""Model tests for LinkedIn module."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.linkedin.models import LinkedInAccount, LinkedInProspect


class LinkedInModelTests(TestCase):
    """Smoke tests for model constraints."""

    def test_unique_prospect_per_account_and_profile(self):
        user = get_user_model().objects.create_user(email="li@test.com", password="test12345", role="admin")
        account = LinkedInAccount.objects.create(
            user=user,
            unipile_account_id="acc_1",
            linkedin_name="LinkedIn User",
            status="active",
        )
        LinkedInProspect.objects.create(account=account, linkedin_profile_id="p_1", full_name="Prospect One")
        with self.assertRaises(Exception):
            LinkedInProspect.objects.create(account=account, linkedin_profile_id="p_1", full_name="Prospect Duplicate")


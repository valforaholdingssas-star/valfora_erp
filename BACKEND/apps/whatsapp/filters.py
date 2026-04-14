"""FilterSets for WhatsApp resources."""

import django_filters

from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber, WhatsAppTemplate


class WhatsAppBusinessAccountFilter(django_filters.FilterSet):
    class Meta:
        model = WhatsAppBusinessAccount
        fields = {
            "is_active": ["exact"],
            "api_version": ["exact"],
        }


class WhatsAppPhoneNumberFilter(django_filters.FilterSet):
    class Meta:
        model = WhatsAppPhoneNumber
        fields = {
            "account": ["exact"],
            "status": ["exact"],
            "is_default": ["exact"],
            "is_active": ["exact"],
        }


class WhatsAppTemplateFilter(django_filters.FilterSet):
    class Meta:
        model = WhatsAppTemplate
        fields = {
            "account": ["exact"],
            "category": ["exact"],
            "status": ["exact"],
            "language": ["exact"],
            "is_active": ["exact"],
        }

"""Filter sets for CRM list endpoints."""

import django_filters
from django.db.models import Q

from apps.crm.models import Activity, Company, Contact, Deal, Document


class ContactFilter(django_filters.FilterSet):
    """Filters for contacts."""

    lifecycle_stage = django_filters.CharFilter(field_name="lifecycle_stage")
    intent_level = django_filters.CharFilter(field_name="intent_level")
    assigned_to = django_filters.UUIDFilter(field_name="assigned_to")
    company = django_filters.UUIDFilter(field_name="company")
    source = django_filters.CharFilter(field_name="source")
    created_after = django_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = Contact
        fields = ("lifecycle_stage", "intent_level", "assigned_to", "company", "source")


class CompanyFilter(django_filters.FilterSet):
    """Filters for companies."""

    country = django_filters.CharFilter(field_name="country", lookup_expr="icontains")

    class Meta:
        model = Company
        fields = ("country",)


class DealFilter(django_filters.FilterSet):
    """Filters for deals."""

    stage = django_filters.CharFilter(field_name="stage")
    assigned_to = django_filters.UUIDFilter(field_name="assigned_to")
    currency = django_filters.CharFilter(field_name="currency")
    company = django_filters.UUIDFilter(field_name="company")
    contact = django_filters.UUIDFilter(field_name="contact")
    source = django_filters.CharFilter(field_name="source")
    is_stale = django_filters.BooleanFilter(field_name="is_stale")

    class Meta:
        model = Deal
        fields = ("stage", "assigned_to", "currency", "company", "contact", "source", "is_stale")


class ActivityFilter(django_filters.FilterSet):
    """Filters for activities."""

    contact = django_filters.UUIDFilter(field_name="contact")
    deal = django_filters.UUIDFilter(field_name="deal")
    is_completed = django_filters.BooleanFilter(field_name="is_completed")

    class Meta:
        model = Activity
        fields = ("contact", "deal", "is_completed", "activity_type")


class DocumentFilter(django_filters.FilterSet):
    """Filters for documents."""

    contact = django_filters.UUIDFilter(field_name="contact")
    deal = django_filters.UUIDFilter(field_name="deal")
    company = django_filters.UUIDFilter(method="filter_company")
    is_global_knowledge = django_filters.BooleanFilter(field_name="is_global_knowledge")
    ai_configuration = django_filters.UUIDFilter(field_name="ai_configuration")

    class Meta:
        model = Document
        fields = ("contact", "deal", "company", "is_global_knowledge", "ai_configuration")

    def filter_company(self, queryset, name, value):
        del name
        return queryset.filter(
            Q(contact__company_id=value) | Q(deal__company_id=value)
        )

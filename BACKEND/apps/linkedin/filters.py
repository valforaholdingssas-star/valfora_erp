"""FilterSets for LinkedIn module."""

import django_filters

from apps.linkedin.models import LinkedInProspect, SavedSearch


class SavedSearchFilter(django_filters.FilterSet):
    """Filters for saved searches."""

    class Meta:
        model = SavedSearch
        fields = {
            "is_active": ["exact"],
            "frequency": ["exact"],
            "network_distance": ["exact"],
        }


class LinkedInProspectFilter(django_filters.FilterSet):
    """Filters for LinkedIn prospects."""

    tag = django_filters.CharFilter(method="filter_tag")

    class Meta:
        model = LinkedInProspect
        fields = {
            "funnel_stage": ["exact"],
            "invitation_status": ["exact"],
            "network_distance": ["exact"],
            "saved_search": ["exact"],
            "is_discarded": ["exact"],
        }

    def filter_tag(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(tags__contains=[value])


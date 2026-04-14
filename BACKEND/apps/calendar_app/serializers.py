"""Serializers for calendar aggregated events."""

from rest_framework import serializers


class CalendarEventSerializer(serializers.Serializer):
    """Unified event payload compatible with FullCalendar."""

    id = serializers.CharField()
    title = serializers.CharField()
    start = serializers.DateTimeField()
    end = serializers.DateTimeField(required=False, allow_null=True)
    type = serializers.ChoiceField(choices=("activity", "follow_up", "deal_close", "overdue"))
    color = serializers.CharField()
    url = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.JSONField()

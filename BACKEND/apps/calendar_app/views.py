"""Views for calendar module."""

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.calendar_app.permissions import IsCalendarUser
from apps.calendar_app.serializers import CalendarEventSerializer
from apps.calendar_app.services import build_calendar_events, parse_date_bounds


class CalendarEventListView(APIView):
    """Return aggregated calendar events for a date range."""

    permission_classes = [IsCalendarUser]

    def get(self, request):
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        assigned_to = request.query_params.get("assigned_to")
        types_raw = request.query_params.get("types", "")
        event_types = {x.strip() for x in types_raw.split(",") if x.strip()} or None
        start_dt, end_dt = parse_date_bounds(start_date, end_date)
        follow_up_days = int(getattr(settings, "CRM_STALE_CONTACT_DAYS", 14))
        events = build_calendar_events(
            start_dt,
            end_dt,
            assigned_to=assigned_to,
            event_types=event_types,
            follow_up_interval_days=follow_up_days,
        )
        serializer = CalendarEventSerializer(events, many=True)
        return Response(serializer.data)

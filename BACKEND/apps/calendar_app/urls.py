"""URL routes for calendar app."""

from django.urls import path

from apps.calendar_app.views import CalendarEventListView

urlpatterns = [
    path("events/", CalendarEventListView.as_view(), name="calendar-events"),
]

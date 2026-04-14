"""Settings endpoints for lead engine automation."""

from django.urls import path

from apps.crm.viewsets import LeadEngineConfigView, LeadEngineDashboardView, PipelineAutomationConfigView

urlpatterns = [
    path("lead-engine/", LeadEngineConfigView.as_view(), name="settings-lead-engine"),
    path("pipeline-automation/", PipelineAutomationConfigView.as_view(), name="settings-pipeline-automation"),
    path("lead-engine/dashboard/", LeadEngineDashboardView.as_view(), name="settings-lead-engine-dashboard"),
]

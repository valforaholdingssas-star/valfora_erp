"""Root URL configuration for Seeds ERP."""

from django.conf import settings
from django.contrib import admin
from django.conf.urls.static import static
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.common.views import health_check, platform_dashboard

_schema_perms = [AllowAny] if settings.DEBUG else [IsAuthenticated]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health_check, name="health"),
    path("api/v1/platform/dashboard/", platform_dashboard, name="platform-dashboard"),
    path("api/v1/auth/", include("apps.accounts.auth_urls")),
    path("api/v1/", include("apps.accounts.resource_urls")),
    path("api/v1/crm/", include("apps.crm.urls")),
    path("api/v1/chat/", include("apps.chat.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/ai-config/", include("apps.ai_config.urls")),
    path("api/v1/settings/", include("apps.crm.settings_urls")),
    path("api/v1/calendar/", include("apps.calendar_app.urls")),
    path("api/v1/finance/", include("apps.finance.urls")),
    path("api/v1/whatsapp/", include("apps.whatsapp.urls")),
    path("api/v1/wiki/", include("apps.wiki.urls")),
    path(
        "api/v1/schema/",
        SpectacularAPIView.as_view(permission_classes=_schema_perms),
        name="schema",
    ),
    path(
        "api/v1/docs/",
        SpectacularSwaggerView.as_view(url_name="schema", permission_classes=_schema_perms),
        name="swagger-ui",
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

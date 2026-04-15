"""Wiki API URLs."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.wiki.viewsets import WikiDocumentViewSet

router = DefaultRouter()
router.register("documents", WikiDocumentViewSet, basename="wiki-document")

urlpatterns = [
    path("", include(router.urls)),
]


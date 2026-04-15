"""Wiki API viewsets."""

from django.shortcuts import get_object_or_404
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.rbac import user_has_module_permission
from apps.common.audit import write_audit_log
from apps.wiki.models import WikiDocument
from apps.wiki.permissions import HasWikiPermission
from apps.wiki.serializers import WikiDocumentSerializer


class WikiDocumentViewSet(viewsets.ModelViewSet):
    """CRUD for wiki documents."""

    queryset = WikiDocument.objects.filter(is_active=True).select_related("created_by", "updated_by")
    serializer_class = WikiDocumentSerializer
    permission_classes = [permissions.IsAuthenticated, HasWikiPermission]
    filterset_fields = ("is_published",)
    search_fields = ("title", "slug")
    ordering_fields = ("menu_order", "title", "created_at", "updated_at")
    ordering = ("menu_order", "title")

    def get_queryset(self):
        qs = super().get_queryset()
        only_published = self.request.query_params.get("published")
        if only_published in {"1", "true", "True", "yes"}:
            qs = qs.filter(is_published=True)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        write_audit_log(
            user=self.request.user,
            action="create",
            instance=instance,
            changes={},
            request=self.request,
        )

    def perform_update(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        write_audit_log(
            user=self.request.user,
            action="update",
            instance=instance,
            changes=dict(serializer.validated_data),
            request=self.request,
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.updated_by = self.request.user
        instance.save(update_fields=["is_active", "updated_by", "updated_at"])
        write_audit_log(
            user=self.request.user,
            action="delete",
            instance=instance,
            changes={"is_active": False},
            request=self.request,
        )

    @action(detail=False, methods=["get"], url_path=r"by-slug/(?P<slug>[-a-zA-Z0-9_]+)")
    def by_slug(self, request, slug=None):
        qs = self.get_queryset()
        document = get_object_or_404(qs, slug=slug)
        if not document.is_published and not user_has_module_permission(request.user, "wiki", "edit"):
            return Response({"detail": "Documento no publicado."}, status=404)
        serializer = self.get_serializer(document)
        return Response(serializer.data)

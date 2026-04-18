"""Wiki serializers."""

from django.utils.text import slugify
from rest_framework import serializers

from apps.wiki.models import WikiDocument


class WikiDocumentSerializer(serializers.ModelSerializer):
    @staticmethod
    def _slug_exists(slug: str, instance=None) -> bool:
        qs = WikiDocument.objects.filter(slug=slug)
        if instance and instance.pk:
            qs = qs.exclude(pk=instance.pk)
        return qs.exists()

    def _build_unique_slug(self, base_slug: str) -> str:
        candidate = base_slug[:200]
        if not self._slug_exists(candidate, self.instance):
            return candidate
        idx = 2
        while idx <= 9999:
            suffix = f"-{idx}"
            candidate = f"{base_slug[: max(1, 200 - len(suffix))]}{suffix}"
            if not self._slug_exists(candidate, self.instance):
                return candidate
            idx += 1
        raise serializers.ValidationError({"slug": "No se pudo generar un slug único."})

    class Meta:
        model = WikiDocument
        fields = (
            "id",
            "title",
            "slug",
            "html_content",
            "menu_order",
            "is_published",
            "created_by",
            "updated_by",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_by", "updated_by", "is_active", "created_at", "updated_at")

    def validate(self, attrs):
        title = attrs.get("title") or getattr(self.instance, "title", "")
        slug = (attrs.get("slug") or "").strip()
        user_provided_slug = bool(slug)
        if not slug:
            slug = slugify(title)[:200]
        if not slug:
            raise serializers.ValidationError({"slug": "No se pudo generar un slug válido."})
        if user_provided_slug:
            if self._slug_exists(slug, self.instance):
                raise serializers.ValidationError({"slug": "Este slug ya existe."})
            attrs["slug"] = slug
        else:
            attrs["slug"] = self._build_unique_slug(slug)
        return attrs

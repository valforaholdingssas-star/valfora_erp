"""Wiki serializers."""

from django.utils.text import slugify
from rest_framework import serializers

from apps.wiki.models import WikiDocument


class WikiDocumentSerializer(serializers.ModelSerializer):
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
        slug = attrs.get("slug")
        if not slug:
            attrs["slug"] = slugify(title)[:200]
        if not attrs.get("slug"):
            raise serializers.ValidationError({"slug": "No se pudo generar un slug válido."})
        return attrs


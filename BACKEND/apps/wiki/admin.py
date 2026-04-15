"""Admin config for wiki."""

from django.contrib import admin

from apps.wiki.models import WikiDocument


@admin.register(WikiDocument)
class WikiDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "menu_order", "is_published", "is_active", "updated_at")
    list_filter = ("is_published", "is_active")
    search_fields = ("title", "slug")
    ordering = ("menu_order", "title")


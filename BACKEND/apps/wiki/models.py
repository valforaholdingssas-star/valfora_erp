"""Wiki models."""

from django.db import models

from apps.common.models import BaseModel


class WikiDocument(BaseModel):
    """Simple HTML wiki document rendered in the frontend."""

    title = models.CharField(max_length=180, db_index=True)
    slug = models.SlugField(max_length=200, unique=True, db_index=True)
    html_content = models.TextField()
    menu_order = models.PositiveIntegerField(default=0, db_index=True)
    is_published = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wiki_documents_created",
    )
    updated_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wiki_documents_updated",
    )

    class Meta:
        ordering = ["menu_order", "title", "-created_at"]
        verbose_name = "Wiki document"
        verbose_name_plural = "Wiki documents"

    def __str__(self) -> str:
        return self.title


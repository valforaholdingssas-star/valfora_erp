"""Custom query managers for finance models."""

from django.db import models


class InvoiceQuerySet(models.QuerySet):
    """Invoice queryset helpers."""

    def receivables(self):
        return self.filter(
            is_active=True,
            status__in=("sent", "partially_paid", "overdue"),
        )


class InvoiceManager(models.Manager):
    """Invoice manager."""

    def get_queryset(self):
        return InvoiceQuerySet(self.model, using=self._db)

    def receivables(self):
        return self.get_queryset().receivables()

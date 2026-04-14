"""Signals for finance domain side effects."""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.finance.models import InvoiceItem, Payment
from apps.finance.services import compute_invoice_amounts


@receiver(post_save, sender=InvoiceItem)
@receiver(post_delete, sender=InvoiceItem)
def recalculate_invoice_after_item_change(sender, instance, **kwargs):
    del sender, kwargs
    if instance.invoice_id:
        compute_invoice_amounts(instance.invoice)


@receiver(post_save, sender=Payment)
@receiver(post_delete, sender=Payment)
def recalculate_invoice_after_payment_change(sender, instance, **kwargs):
    del sender, kwargs
    if instance.invoice_id:
        compute_invoice_amounts(instance.invoice)

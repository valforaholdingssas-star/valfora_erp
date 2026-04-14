"""Admin for chat models."""

from django.contrib import admin

from apps.chat.models import Conversation, Message, MessageAttachment


class MessageInline(admin.TabularInline):
    """Messages inline on conversation."""

    model = Message
    extra = 0
    show_change_link = True
    readonly_fields = ("sender_type", "status", "created_at")


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    """Conversation admin."""

    list_display = ("id", "contact", "channel", "status", "unread_count", "last_message_at", "is_active")
    list_filter = ("channel", "status")
    search_fields = ("contact__email",)
    raw_id_fields = ("contact", "assigned_to")
    inlines = [MessageInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    """Message admin."""

    list_display = ("id", "conversation", "sender_type", "status", "created_at")
    list_filter = ("sender_type", "status", "message_type")
    search_fields = ("content",)
    raw_id_fields = ("conversation", "sender_user")


@admin.register(MessageAttachment)
class MessageAttachmentAdmin(admin.ModelAdmin):
    """Attachment admin."""

    list_display = ("file_name", "message", "file_size", "created_at")
    raw_id_fields = ("message",)

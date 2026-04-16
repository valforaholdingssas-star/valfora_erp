"""API viewsets for AI configuration."""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminOrSuperAdmin
from apps.ai_config.permissions import HasAIConfigPermission
from apps.ai_config.models import AIConfiguration
from apps.ai_config.runtime import get_or_create_runtime_settings
from apps.ai_config.serializers import (
    AIConfigurationSerializer,
    AIConfigurationTestSerializer,
    AIRuntimeSettingsSerializer,
)
from apps.ai_config.services import build_openai_test_messages, generate_chat_completion
from apps.common.audit import write_audit_log


class AIConfigurationViewSet(viewsets.ModelViewSet):
    """CRUD for AI settings (admin / super_admin only)."""

    queryset = AIConfiguration.objects.filter(is_active=True)
    serializer_class = AIConfigurationSerializer
    permission_classes = [IsAdminOrSuperAdmin, HasAIConfigPermission]
    filterset_fields = ("is_default",)
    search_fields = ("name", "llm_model")

    def perform_create(self, serializer):
        instance = serializer.save()
        write_audit_log(
            user=self.request.user,
            action="create",
            instance=instance,
            changes={},
            request=self.request,
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        write_audit_log(
            user=self.request.user,
            action="update",
            instance=instance,
            changes=dict(serializer.validated_data),
            request=self.request,
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        write_audit_log(
            user=self.request.user,
            action="delete",
            instance=instance,
            changes={"is_active": False},
            request=self.request,
        )

    @action(detail=True, methods=["post"], url_path="test")
    def test(self, request, pk=None):
        """Sandbox completion: system prompt + user message (no CRM / RAG)."""
        config = self.get_object()
        ser = AIConfigurationTestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        messages = build_openai_test_messages(
            config=config,
            user_message=ser.validated_data["message"],
        )
        try:
            result = generate_chat_completion(messages=messages, config=config)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(
            {
                "reply": result.text,
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "total_tokens": result.total_tokens,
            },
        )


class AIRuntimeSettingsView(APIView):
    """Read/update runtime OpenAI credentials without server restart."""

    permission_classes = [IsAdminOrSuperAdmin, HasAIConfigPermission]

    def get(self, request):
        instance = get_or_create_runtime_settings()
        data = AIRuntimeSettingsSerializer(instance).data
        return Response(data)

    def patch(self, request):
        instance = get_or_create_runtime_settings()
        serializer = AIRuntimeSettingsSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        write_audit_log(
            user=request.user,
            action="update",
            instance=updated,
            changes={k: ("***" if "key" in k else v) for k, v in serializer.validated_data.items()},
            request=request,
        )
        return Response(AIRuntimeSettingsSerializer(updated).data)

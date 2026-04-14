"""JSON renderers for consistent API envelopes."""

from typing import Any

from rest_framework.renderers import JSONRenderer


class EnvelopeJSONRenderer(JSONRenderer):
    """Wrap successful JSON responses in the standard success envelope."""

    def render(
        self,
        data: Any,
        accepted_media_type: str | None,
        renderer_context: dict | None,
    ) -> bytes:
        request = (renderer_context or {}).get("request")
        if request and (
            request.path.startswith("/api/v1/schema")
            or request.path.startswith("/api/v1/docs")
        ):
            return super().render(data, accepted_media_type, renderer_context)

        if isinstance(data, dict) and data.get("status") in ("success", "error"):
            return super().render(data, accepted_media_type, renderer_context)

        message = ""
        if isinstance(data, dict) and "message" in data and "data" not in data:
            message = str(data.pop("message", ""))

        wrapped: dict[str, Any] = {
            "status": "success",
            "data": data,
            "message": message,
        }
        return super().render(wrapped, accepted_media_type, renderer_context)

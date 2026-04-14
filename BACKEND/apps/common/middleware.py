"""Custom middleware definitions."""

from django.utils.deprecation import MiddlewareMixin


class RequestMetadataMiddleware(MiddlewareMixin):
    """Attach lightweight metadata to request for downstream usage."""

    def process_request(self, request) -> None:
        request.client_ip = request.META.get("REMOTE_ADDR", "")

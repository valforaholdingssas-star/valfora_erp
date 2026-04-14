"""WhatsApp Cloud API wrapper service."""

from __future__ import annotations

from typing import Any

import requests

from apps.whatsapp.models import WhatsAppBusinessAccount, WhatsAppPhoneNumber, WhatsAppTemplate


class WhatsAppAPIError(RuntimeError):
    """Exception raised when Meta API returns an error response."""


class WhatsAppAPIService:
    """Wrapper for Meta WhatsApp Business Cloud API."""

    BASE_URL = "https://graph.facebook.com"

    def __init__(self, phone_number: WhatsAppPhoneNumber):
        self.phone_number = phone_number
        self.account: WhatsAppBusinessAccount = phone_number.account
        self.api_url = f"{self.BASE_URL}/{self.account.api_version}/{self.phone_number.phone_number_id}"
        self.headers = {
            "Authorization": f"Bearer {self.account.access_token}",
            "Content-Type": "application/json",
        }

    def _post(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(f"{self.api_url}/{endpoint}", json=payload, headers=self.headers, timeout=30)
        data = response.json() if response.content else {}
        if response.status_code >= 400:
            raise WhatsAppAPIError(str(data))
        return data

    def _get(self, endpoint: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        response = requests.get(f"{self.api_url}/{endpoint}", params=params or {}, headers=self.headers, timeout=30)
        data = response.json() if response.content else {}
        if response.status_code >= 400:
            raise WhatsAppAPIError(str(data))
        return data

    def send_text_message(self, to: str, body: str, preview_url: bool = False) -> dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": body, "preview_url": preview_url},
        }
        return self._post("messages", payload)

    def send_template_message(
        self,
        to: str,
        template_name: str,
        language: str,
        components: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
                "components": components or [],
            },
        }
        return self._post("messages", payload)

    def send_image_message(self, to: str, image_url: str | None = None, image_id: str | None = None, caption: str | None = None) -> dict[str, Any]:
        image: dict[str, Any] = {}
        if image_url:
            image["link"] = image_url
        if image_id:
            image["id"] = image_id
        if caption:
            image["caption"] = caption
        payload = {"messaging_product": "whatsapp", "to": to, "type": "image", "image": image}
        return self._post("messages", payload)

    def send_document_message(
        self,
        to: str,
        document_url: str | None = None,
        document_id: str | None = None,
        filename: str | None = None,
        caption: str | None = None,
    ) -> dict[str, Any]:
        document: dict[str, Any] = {}
        if document_url:
            document["link"] = document_url
        if document_id:
            document["id"] = document_id
        if filename:
            document["filename"] = filename
        if caption:
            document["caption"] = caption
        payload = {"messaging_product": "whatsapp", "to": to, "type": "document", "document": document}
        return self._post("messages", payload)

    def send_audio_message(self, to: str, audio_url: str | None = None, audio_id: str | None = None) -> dict[str, Any]:
        audio: dict[str, Any] = {}
        if audio_url:
            audio["link"] = audio_url
        if audio_id:
            audio["id"] = audio_id
        payload = {"messaging_product": "whatsapp", "to": to, "type": "audio", "audio": audio}
        return self._post("messages", payload)

    def send_interactive_buttons(self, to: str, body: str, buttons: list[dict[str, Any]]) -> dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {"buttons": buttons[:3]},
            },
        }
        return self._post("messages", payload)

    def send_interactive_list(self, to: str, body: str, button_text: str, sections: list[dict[str, Any]]) -> dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "body": {"text": body},
                "action": {"button": button_text, "sections": sections},
            },
        }
        return self._post("messages", payload)

    def send_reaction(self, to: str, message_id: str, emoji: str) -> dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "reaction",
            "reaction": {"message_id": message_id, "emoji": emoji},
        }
        return self._post("messages", payload)

    def mark_as_read(self, message_id: str) -> dict[str, Any]:
        return self._post("messages", {"messaging_product": "whatsapp", "status": "read", "message_id": message_id})

    def upload_media(self, file_path: str, mime_type: str) -> str:
        with open(file_path, "rb") as fh:
            files = {"file": fh}
            data = {"messaging_product": "whatsapp", "type": mime_type}
            response = requests.post(
                f"{self.api_url}/media",
                headers={"Authorization": self.headers["Authorization"]},
                files=files,
                data=data,
                timeout=60,
            )
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            raise WhatsAppAPIError(str(body))
        return str(body.get("id") or "")

    def download_media(self, media_id: str) -> bytes:
        meta = self._get(f"../../{media_id}")
        url = meta.get("url")
        if not url:
            raise WhatsAppAPIError("Media URL not returned by API")
        response = requests.get(url, headers={"Authorization": self.headers["Authorization"]}, timeout=120)
        if response.status_code >= 400:
            raise WhatsAppAPIError(response.text)
        return response.content

    def create_template(self, template_data: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.BASE_URL}/{self.account.api_version}/{self.account.waba_id}/message_templates"
        response = requests.post(url, json=template_data, headers=self.headers, timeout=30)
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            raise WhatsAppAPIError(str(body))
        return body

    def get_templates(self) -> list[dict[str, Any]]:
        url = f"{self.BASE_URL}/{self.account.api_version}/{self.account.waba_id}/message_templates"
        response = requests.get(url, headers=self.headers, timeout=30)
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            raise WhatsAppAPIError(str(body))
        return body.get("data") or []

    def delete_template(self, template_name: str) -> dict[str, Any]:
        url = f"{self.BASE_URL}/{self.account.api_version}/{self.account.waba_id}/message_templates"
        response = requests.delete(url, headers=self.headers, params={"name": template_name}, timeout=30)
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            raise WhatsAppAPIError(str(body))
        return body

    def sync_templates(self) -> int:
        records = self.get_templates()
        synced = 0
        for item in records:
            WhatsAppTemplate.objects.update_or_create(
                account=self.account,
                name=item.get("name") or "unnamed",
                language=((item.get("language") or "es") if isinstance(item.get("language"), str) else "es"),
                defaults={
                    "meta_template_id": item.get("id") or "",
                    "category": (item.get("category") or "utility").lower(),
                    "status": (item.get("status") or "pending").lower(),
                    "body_text": _extract_template_body(item),
                    "buttons": item.get("components") or [],
                },
            )
            synced += 1
        return synced

    def get_business_profile(self) -> dict[str, Any]:
        return self._get("whatsapp_business_profile", params={"fields": "about,address,description,email,profile_picture_url,websites"})

    def update_business_profile(self, profile_data: dict[str, Any]) -> dict[str, Any]:
        return self._post("whatsapp_business_profile", profile_data)


def _extract_template_body(item: dict[str, Any]) -> str:
    for component in item.get("components") or []:
        if (component.get("type") or "").upper() == "BODY":
            return component.get("text") or ""
    return ""

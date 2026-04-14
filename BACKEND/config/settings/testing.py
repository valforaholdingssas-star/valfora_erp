"""Testing settings."""

from pathlib import Path

from dotenv import load_dotenv

from .base import *  # noqa: F403,F401

DEBUG = False
SECRET_KEY = "test-secret-key-must-be-32-bytes-min-for-jwt-tests!!"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

_backend_dir = Path(__file__).resolve().parent.parent.parent
_project_root = _backend_dir.parent
load_dotenv(_project_root / ".env", override=False)
load_dotenv(_backend_dir / ".env", override=False)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "seeds-erp-test-cache",
    }
}

# Throttling desactivado en tests (evita 429 en suites largas)
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_CLASSES": (),
}

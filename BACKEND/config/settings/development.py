"""Development settings."""

from pathlib import Path

from dotenv import load_dotenv

from .base import *  # noqa: F403,F401

DEBUG = True

_backend_dir = Path(__file__).resolve().parent.parent.parent
_project_root = _backend_dir.parent
load_dotenv(_project_root / ".env")
load_dotenv(_backend_dir / ".env")

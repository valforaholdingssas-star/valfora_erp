#!/usr/bin/env python3
"""Django administrative utility for Seeds ERP."""

import os
import sys


def main() -> None:
    """Run administrative tasks."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Ensure dependencies are installed."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()

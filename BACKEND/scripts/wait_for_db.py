#!/usr/bin/env python3
"""Wait until PostgreSQL accepts connections (Docker entrypoint helper)."""

from __future__ import annotations

import os
import sys
import time

import psycopg2
from psycopg2 import OperationalError

RETRIES = 60
INTERVAL_SEC = 1


def main() -> None:
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    name = os.environ.get("POSTGRES_DB", "seeds_erp")
    user = os.environ.get("POSTGRES_USER", "seeds_user")
    password = os.environ.get("POSTGRES_PASSWORD", "seeds_password")

    for attempt in range(1, RETRIES + 1):
        try:
            conn = psycopg2.connect(
                host=host,
                port=port,
                dbname=name,
                user=user,
                password=password,
                connect_timeout=5,
            )
            conn.close()
            return
        except OperationalError as exc:
            if attempt == RETRIES:
                print(f"PostgreSQL not reachable after {RETRIES} attempts: {exc}", file=sys.stderr)
                sys.exit(1)
            time.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    main()

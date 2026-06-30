# scripts/migrate_beats.py
"""Additive migration CLI: add beat-native columns to an existing tabit SQLite DB.

The app runs the same migration automatically on startup (see app.main); this
script is for migrating a database out-of-band. It delegates to
``app.migrations.run_additive_migrations`` so there is a single source of truth
for which columns exist. Safe to run repeatedly. Existing chord rows keep
stale/NULL beat values until each recording is re-analyzed
(POST /api/recordings/{id}/analyze), which re-seeds the chart in beats.

Usage: .venv/bin/python scripts/migrate_beats.py [sqlite_path]
"""

from __future__ import annotations

import os
import sys

# Allow running as `python scripts/migrate_beats.py` from the repo root by
# putting the repo root (this file's parent's parent) on the import path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine

from app.migrations import run_additive_migrations


def migrate(path: str) -> None:
    engine = create_engine(f"sqlite:///{path}")
    for column in run_additive_migrations(engine):
        print(f"added {column}")
    print("done — re-analyze each recording to populate beats")


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else "tabit.db")

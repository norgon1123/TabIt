# scripts/migrate_beats.py
"""Additive migration: add beat-native columns to an existing tabit SQLite DB.

The app has no Alembic; tables come from create_all. This adds the new columns to
pre-existing databases so the app boots. Existing chord rows keep stale/NULL beat
values until each recording is re-analyzed (POST /api/recordings/{id}/analyze),
which re-seeds the chart in beats. Safe to run repeatedly.

Usage: .venv/bin/python scripts/migrate_beats.py [sqlite_path]
"""

from __future__ import annotations

import sqlite3
import sys

ADDITIONS = {
    "analyses": [("beat_times", "TEXT NOT NULL DEFAULT '[]'")],
    "chord_charts": [
        ("beats_per_measure", "INTEGER NOT NULL DEFAULT 4"),
        ("measure_offset", "INTEGER NOT NULL DEFAULT 0"),
        ("beat_times", "TEXT NOT NULL DEFAULT '[]'"),
    ],
    "chord_segments": [
        ("start_beat", "REAL NOT NULL DEFAULT 0"),
        ("end_beat", "REAL NOT NULL DEFAULT 0"),
    ],
}


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def migrate(path: str) -> None:
    conn = sqlite3.connect(path)
    try:
        for table, cols in ADDITIONS.items():
            existing = _columns(conn, table)
            if not existing:
                continue  # table not created yet; create_all will handle it
            for name, decl in cols:
                if name not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
                    print(f"added {table}.{name}")
        conn.commit()
    finally:
        conn.close()
    print("done — re-analyze each recording to populate beats")


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else "tabit.db")

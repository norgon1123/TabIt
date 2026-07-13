"""Additive, idempotent schema migrations for the SQLite database.

The app has no Alembic; tables are created by ``Base.metadata.create_all``,
which creates *missing tables* but never alters existing ones. A database
created before a column was introduced therefore keeps its stale schema forever
— and the ORM, expecting the new column, fails on any query that touches it
(e.g. deleting a recording loads its segments ``ORDER BY start_beat``).

`run_additive_migrations` bridges that gap: for each column in `ADDITIONS` that
a live table lacks, it issues ``ALTER TABLE ... ADD COLUMN``. It is safe to run
on every startup and on already-current databases.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# Columns added after the initial schema, keyed by table. Each entry is
# (column_name, column_definition). Definitions carry a default so existing
# rows get a valid value; beat columns stay 0 until the recording is
# re-analyzed, which re-seeds the chart in beats.
ADDITIONS: dict[str, list[tuple[str, str]]] = {
    "analyses": [("beat_times", "TEXT NOT NULL DEFAULT '[]'")],
    "chord_charts": [
        ("beats_per_measure", "INTEGER NOT NULL DEFAULT 4"),
        ("measure_offset", "INTEGER NOT NULL DEFAULT 0"),
        ("beat_times", "TEXT NOT NULL DEFAULT '[]'"),
        # Nullable: an existing chart has no user tempo yet, and falls back to the
        # detected Analysis.bpm until one is set.
        ("bpm", "REAL"),
    ],
    "chord_segments": [
        ("start_beat", "REAL NOT NULL DEFAULT 0"),
        ("end_beat", "REAL NOT NULL DEFAULT 0"),
    ],
}


def run_additive_migrations(engine: Engine) -> list[str]:
    """Add any missing post-initial columns to existing tables.

    Returns the list of ``table.column`` names that were added (empty when the
    database is already current). Only operates on SQLite; other dialects are
    expected to use real migrations.
    """
    if engine.dialect.name != "sqlite":
        return []

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied: list[str] = []

    with engine.begin() as conn:
        for table, cols in ADDITIONS.items():
            if table not in existing_tables:
                continue  # brand-new DB: create_all builds it with current schema
            present = {c["name"] for c in inspector.get_columns(table)}
            for name, decl in cols:
                if name not in present:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {decl}"))
                    applied.append(f"{table}.{name}")

    return applied

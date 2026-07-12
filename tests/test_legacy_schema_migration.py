"""Regression: a user must never be blocked from deleting a recording or chart.

A database created before the beat-native merge lacks the columns the current
models expect (``chord_segments.start_beat`` chief among them). ``create_all``
only creates missing *tables* — it never adds columns to existing ones — so such
a database keeps its stale schema forever. Deleting a recording cascades to its
chart and segments, and the ``segments`` relationship is ordered by
``start_beat``, producing:

    sqlalchemy.exc.OperationalError: no such column: chord_segments.start_beat

These tests reproduce that failure and prove the startup additive migration
(`run_additive_migrations`) bridges the gap so deletes succeed.
"""

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.db import Base
from app.migrations import run_additive_migrations

# Columns introduced after the initial schema. A pre-beat-native database lacks
# these; dropping them from a freshly created schema faithfully reproduces it.
_LEGACY_MISSING = {
    "analyses": ["beat_times"],
    "chord_charts": ["beats_per_measure", "measure_offset", "beat_times"],
    "chord_segments": ["start_beat", "end_beat"],
}

# A timestamp in the exact format SQLAlchemy's SQLite dialect round-trips.
_TS = "2020-01-01 00:00:00.000000"


def _legacy_engine(missing=None):
    """Build an in-memory SQLite DB shaped like a pre-beat-native database."""
    missing = _LEGACY_MISSING if missing is None else missing
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table, cols in missing.items():
            for col in cols:
                conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {col}"))
    return engine


def _insert(conn, present, table, values):
    """Insert ``values`` into ``table``, keeping only columns the table has.

    Different legacy shapes drop different columns, so we filter to what exists
    rather than hardcode one column list. Raw SQL is required because the ORM
    models reference columns the legacy schema lacks. ``present`` is the set of
    live column names, computed *before* the transaction — reflecting mid-
    transaction on a shared in-memory connection would roll the inserts back.
    """
    cols = [c for c in values if c in present]
    placeholders = ", ".join(f":{c}" for c in cols)
    conn.execute(
        text(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})"),
        {c: values[c] for c in cols},
    )


def _seed_recording_chart_segment(engine):
    """Insert a user → recording → chart → segment chain via raw SQL."""
    inspector = inspect(engine)
    # Reflect every table up front; doing it inside the transaction below would
    # check out the StaticPool connection and roll back our pending inserts.
    cols = {
        t: {c["name"] for c in inspector.get_columns(t)}
        for t in ("users", "recordings", "chord_charts", "chord_segments")
    }
    with engine.begin() as conn:
        _insert(conn, cols["users"], "users", {
            "id": "u1", "username": "alice", "password_hash": "h", "created_at": _TS,
        })
        _insert(conn, cols["recordings"], "recordings", {
            "id": "r1", "user_id": "u1", "original_filename": "song.mp3",
            "format": "mp3", "stored_path": "/tmp/song.mp3", "status": "complete",
            "created_at": _TS,
        })
        _insert(conn, cols["chord_charts"], "chord_charts", {
            "id": "c1", "recording_id": "r1", "key_tonic": "C", "key_mode": "major",
            "beats_per_measure": 4, "measure_offset": 0, "beat_times": "[]",
        })
        _insert(conn, cols["chord_segments"], "chord_segments", {
            "id": "s1", "chart_id": "c1", "chord_root": "C", "chord_quality": "major",
        })


def test_reproduces_reported_error_on_legacy_db():
    """Deleting a recording on a legacy DB raises the reported OperationalError."""
    # Reproduce exactly the user's database: only the chord_segments beat columns
    # are missing (the chart/analysis columns had already been added).
    engine = _legacy_engine({"chord_segments": ["start_beat", "end_beat"]})
    _seed_recording_chart_segment(engine)
    session = sessionmaker(bind=engine)()

    rec = session.get(models.Recording, "r1")
    with pytest.raises(OperationalError) as excinfo:
        session.delete(rec)
        session.commit()

    assert "no such column: chord_segments.start_beat" in str(excinfo.value)
    session.close()


def test_migration_unblocks_recording_delete():
    """After the additive migration, deleting a recording succeeds end-to-end."""
    engine = _legacy_engine()
    _seed_recording_chart_segment(engine)

    run_additive_migrations(engine)

    session = sessionmaker(bind=engine)()
    rec = session.get(models.Recording, "r1")
    session.delete(rec)
    session.commit()

    # Recording and its cascaded chart + segment are gone.
    assert session.get(models.Recording, "r1") is None
    assert session.get(models.ChordChart, "c1") is None
    assert session.get(models.ChordSegment, "s1") is None
    session.close()


def test_migration_unblocks_segment_delete():
    """After the migration, deleting an individual chord segment succeeds."""
    engine = _legacy_engine()
    _seed_recording_chart_segment(engine)

    run_additive_migrations(engine)

    session = sessionmaker(bind=engine)()
    chart = session.get(models.ChordChart, "c1")
    seg = next(s for s in chart.segments if s.id == "s1")
    session.delete(seg)
    session.commit()

    assert session.get(models.ChordSegment, "s1") is None
    session.close()


def test_migration_adds_missing_columns_and_is_idempotent():
    """The migration adds every missing column and is safe to run repeatedly."""
    engine = _legacy_engine()

    applied = run_additive_migrations(engine)
    assert "chord_segments.start_beat" in applied
    assert "chord_segments.end_beat" in applied
    assert "chord_charts.beats_per_measure" in applied

    inspector = inspect(engine)
    seg_cols = {c["name"] for c in inspector.get_columns("chord_segments")}
    assert {"start_beat", "end_beat"} <= seg_cols

    # Running again is a no-op (nothing left to add).
    assert run_additive_migrations(engine) == []

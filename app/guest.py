"""Ephemeral, account-free analysis for logged-out visitors.

A guest's song never reaches the database. It lives in this in-process store, keyed by the
hash of a cookie token, and its audio exists on disk only while the analysis job is reading
it — `analyze_guest_recording` (app/jobs.py) deletes the file as soon as processing ends,
success or failure. Entries also expire (`TABIT_GUEST_TTL_SECONDS`, sliding), and one guest
holds at most one recording at a time, so trying Tabit leaves nothing behind.

The dataclasses below deliberately mirror the attribute names of the ORM models they stand
in for (`Recording`, `Analysis`, `ChordChart`, `ChordSegment`) so the recording and chart
routers can serve a guest and a signed-in user through the same code path — see
`app/chart_store.py` for the seam.
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import lru_cache

from app.config import get_settings
from app.storage import delete_audio


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class GuestSegment:
    start_beat: float
    end_beat: float
    chord_root: str
    chord_quality: str
    id: str = field(default_factory=_uuid)


@dataclass
class GuestChart:
    recording: "GuestRecording" = field(repr=False)
    key_tonic: str
    key_mode: str
    beat_times: list[float] = field(default_factory=list)
    beats_per_measure: int = 4
    measure_offset: int = 0
    segments: list[GuestSegment] = field(default_factory=list)
    id: str = field(default_factory=_uuid)

    @property
    def recording_id(self) -> str:
        return self.recording.id


@dataclass
class GuestAnalysis:
    status: str = "pending"
    bpm: float | None = None
    detected_key_tonic: str | None = None
    detected_key_mode: str | None = None
    engine_version: str | None = None
    error: str | None = None
    beat_times: list[float] = field(default_factory=list)


@dataclass
class GuestRecording:
    original_filename: str
    format: str
    stored_path: str = ""
    duration_seconds: float | None = None
    status: str = "uploaded"
    id: str = field(default_factory=_uuid)
    created_at: datetime = field(default_factory=_now)
    analysis: GuestAnalysis = field(default_factory=GuestAnalysis)
    chart: GuestChart | None = None
    # Monotonic clock, refreshed on every access — the TTL slides so a guest editing a chart
    # for an hour doesn't have it purged out from under them.
    touched_at: float = field(default_factory=time.monotonic)


class GuestStore:
    """The guest's single in-flight recording, held in memory and never written to the DB."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._entries: dict[str, GuestRecording] = {}
        self._lock = threading.Lock()

    def get(self, key: str | None) -> GuestRecording | None:
        """The guest's recording, or None. Expired entries are dropped (and their audio with
        them) rather than returned."""
        if not key:
            return None
        self.purge_expired()
        with self._lock:
            rec = self._entries.get(key)
            if rec is not None:
                rec.touched_at = time.monotonic()
            return rec

    def put(self, key: str, recording: GuestRecording) -> None:
        """Store the guest's recording, discarding whatever they had before."""
        with self._lock:
            previous = self._entries.get(key)
            self._entries[key] = recording
        if previous is not None:
            _discard(previous)

    def discard(self, key: str | None) -> None:
        if not key:
            return
        with self._lock:
            rec = self._entries.pop(key, None)
        if rec is not None:
            _discard(rec)

    def purge_expired(self) -> None:
        cutoff = time.monotonic() - self._ttl
        with self._lock:
            stale = [k for k, r in self._entries.items() if r.touched_at < cutoff]
            dropped = [self._entries.pop(k) for k in stale]
        for rec in dropped:
            _discard(rec)

    def __len__(self) -> int:  # tests assert the store empties out
        return len(self._entries)


def _discard(recording: GuestRecording) -> None:
    """Drop an entry's audio. Normally already gone — the job deletes it the moment analysis
    ends — but a crashed or still-running job can leave a file behind."""
    if recording.stored_path:
        delete_audio(recording.stored_path)
        recording.stored_path = ""


@lru_cache
def get_guest_store() -> GuestStore:
    return GuestStore(get_settings().guest_ttl_seconds)

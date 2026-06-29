# Tabit Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tabit FastAPI backend foundation — multi-user auth with persistent sessions, the pure music-theory engine, persistence models, and the REST API for recordings and editable chord charts — *excluding* audio analysis (Plan 2).

**Architecture:** A single FastAPI service with SQLAlchemy 2.0 over SQLite. Auth uses opaque server-side session tokens stored hashed in the DB and delivered in a long-lived httpOnly cookie; logout revokes the row. All recordings/charts are scoped to the owning user. The music-theory module is pure (no I/O) and is the source of truth for transposition and roman numerals. In this plan, chords/charts are created and edited manually (the analysis pipeline that seeds them comes in Plan 2).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, SQLite, Pydantic v2 + pydantic-settings, argon2-cffi (password hashing), pytest + httpx (TestClient).

---

## File Structure

```
tabit/
  pyproject.toml                 # project metadata + dependencies
  app/
    __init__.py
    config.py                    # Settings (env-driven): db url, storage dir, cookie config
    db.py                        # engine, SessionLocal, Base, get_db dependency
    models.py                    # ORM: User, Session, Recording, Analysis, ChordChart, ChordSegment
    music_theory.py              # pure functions: pitch utils, transpose, roman_numeral
    security.py                  # password hashing + session-token hashing/generation
    schemas.py                   # Pydantic request/response models
    deps.py                      # get_current_user dependency
    storage.py                   # save/delete uploaded audio files on disk
    main.py                      # FastAPI app, router registration
    routers/
      __init__.py
      auth.py                    # register, login, logout, me
      recordings.py              # list/create(upload)/get/delete recordings
      charts.py                  # create chart, get chart, segment CRUD, transpose
  tests/
    __init__.py
    conftest.py                  # db + client + authed-client fixtures
    test_music_theory.py
    test_security.py
    test_auth.py
    test_recordings.py
    test_charts.py
```

**Responsibilities:**
- `music_theory.py` — pure domain logic; no DB, no FastAPI. Most heavily tested unit.
- `models.py` — persistence only. No business logic.
- `routers/*` — thin HTTP layer: parse, authorize, delegate, serialize.
- `charts.py` router holds the chart/segment validation + transpose orchestration (small enough to keep with the router for v1).

---

## Task 1: Project setup and health check

**Files:**
- Create: `pyproject.toml`
- Create: `app/__init__.py` (empty)
- Create: `app/config.py`
- Create: `app/db.py`
- Create: `app/main.py`
- Create: `tests/__init__.py` (empty)
- Create: `tests/conftest.py`
- Test: `tests/test_health.py`

- [ ] **Step 1: Create `pyproject.toml`**

```toml
[project]
name = "tabit"
version = "0.1.0"
description = "Turn practice voice memos into editable chord charts"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.111",
    "uvicorn[standard]>=0.30",
    "sqlalchemy>=2.0",
    "pydantic>=2.7",
    "pydantic-settings>=2.3",
    "argon2-cffi>=23.1",
    "python-multipart>=0.0.9",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.2",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v"
```

- [ ] **Step 2: Create `app/config.py`**

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TABIT_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./tabit.db"
    storage_dir: str = "./storage"
    session_cookie_name: str = "tabit_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 365  # 1 year ("stay logged in")
    cookie_secure: bool = False  # set True behind HTTPS in production


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 3: Create `app/db.py`**

```python
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()
_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
engine = create_engine(_settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Create `app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="Tabit")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Create `tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 6: Write the failing health test** in `tests/test_health.py`

```python
def test_health_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 7: Install deps and run the test**

Run:
```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest tests/test_health.py -v
```
Expected: PASS (`test_health_returns_ok`).

- [ ] **Step 8: Commit**

```bash
git add pyproject.toml app tests
git commit -m "feat: project skeleton with health endpoint"
```

---

## Task 2: Music-theory engine

The pure core. Notes are pitch classes 0–11 (C=0). Chord qualities for v1: `maj`, `min`, `dom7`, `maj7`, `min7`. Roman numerals use fixed degree tables; quality controls case (`maj/dom7/maj7` → uppercase, `min/min7` → lowercase) and suffix (`dom7`/`min7` → `7`, `maj7` → `maj7`). Spelling prefers flats for flat keys, otherwise sharps.

**Files:**
- Create: `app/music_theory.py`
- Test: `tests/test_music_theory.py`

- [ ] **Step 1: Write the failing tests** in `tests/test_music_theory.py`

```python
import pytest

from app.music_theory import (
    Quality,
    key_prefers_flats,
    note_to_pitch_class,
    pitch_class_to_note,
    roman_numeral,
    transpose_note,
)


def test_note_to_pitch_class_handles_sharps_and_flats():
    assert note_to_pitch_class("C") == 0
    assert note_to_pitch_class("C#") == 1
    assert note_to_pitch_class("Db") == 1
    assert note_to_pitch_class("B") == 11


def test_note_to_pitch_class_rejects_invalid():
    with pytest.raises(ValueError):
        note_to_pitch_class("H")


def test_pitch_class_to_note_respects_flat_preference():
    assert pitch_class_to_note(1, prefer_flats=False) == "C#"
    assert pitch_class_to_note(1, prefer_flats=True) == "Db"
    assert pitch_class_to_note(0, prefer_flats=True) == "C"


def test_key_prefers_flats():
    assert key_prefers_flats("F", "major") is True
    assert key_prefers_flats("Bb", "major") is True
    assert key_prefers_flats("G", "major") is False
    assert key_prefers_flats("C", "major") is False
    assert key_prefers_flats("C", "minor") is True   # relative of Eb major
    assert key_prefers_flats("A", "minor") is False


def test_transpose_note_wraps_and_spells_for_key():
    # G up 2 semitones -> A (sharp/neutral key)
    assert transpose_note("G", 2, prefer_flats=False) == "A"
    # A# up 1 -> B
    assert transpose_note("A#", 1, prefer_flats=False) == "B"
    # G down 2 -> F
    assert transpose_note("G", -2, prefer_flats=True) == "F"
    # C up 1 spelled as Db in a flat context
    assert transpose_note("C", 1, prefer_flats=True) == "Db"


def test_roman_numeral_major_key_diatonic():
    assert roman_numeral("C", Quality.MAJ, "C", "major") == "I"
    assert roman_numeral("F", Quality.MAJ, "C", "major") == "IV"
    assert roman_numeral("G", Quality.MAJ, "C", "major") == "V"
    assert roman_numeral("A", Quality.MIN, "C", "major") == "vi"
    assert roman_numeral("D", Quality.MIN, "C", "major") == "ii"


def test_roman_numeral_sevenths_get_suffix():
    assert roman_numeral("G", Quality.DOM7, "C", "major") == "V7"
    assert roman_numeral("C", Quality.MAJ7, "C", "major") == "Imaj7"
    assert roman_numeral("D", Quality.MIN7, "C", "major") == "ii7"


def test_roman_numeral_non_diatonic_gets_accidental():
    assert roman_numeral("Eb", Quality.MAJ, "C", "major") == "bIII"
    assert roman_numeral("Bb", Quality.MAJ, "C", "major") == "bVII"


def test_roman_numeral_minor_key():
    assert roman_numeral("A", Quality.MIN, "A", "minor") == "i"
    assert roman_numeral("C", Quality.MAJ, "A", "minor") == "III"
    assert roman_numeral("E", Quality.MIN, "A", "minor") == "v"
    assert roman_numeral("D", Quality.MIN, "A", "minor") == "iv"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_music_theory.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.music_theory'`.

- [ ] **Step 3: Implement `app/music_theory.py`**

```python
"""Pure music-theory functions. No I/O, no framework dependencies."""

from enum import StrEnum


class Quality(StrEnum):
    MAJ = "maj"
    MIN = "min"
    DOM7 = "dom7"
    MAJ7 = "maj7"
    MIN7 = "min7"


_NOTE_TO_PC = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
    "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
}
_SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Tonics (by name) whose key signatures use flats.
_MAJOR_FLAT_TONICS = {"F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"}
_MINOR_FLAT_TONICS = {"D", "G", "C", "F", "Bb", "Eb", "Ab"}

# Semitone offset from tonic -> roman base (uppercase, with accidental prefix).
_MAJOR_DEGREES = {
    0: "I", 1: "bII", 2: "II", 3: "bIII", 4: "III", 5: "IV",
    6: "#IV", 7: "V", 8: "bVI", 9: "VI", 10: "bVII", 11: "VII",
}
_MINOR_DEGREES = {
    0: "I", 1: "bII", 2: "II", 3: "III", 4: "#III", 5: "IV",
    6: "#IV", 7: "V", 8: "VI", 9: "#VI", 10: "VII", 11: "#VII",
}

_UPPERCASE_QUALITIES = {Quality.MAJ, Quality.DOM7, Quality.MAJ7}
_SUFFIX = {
    Quality.MAJ: "", Quality.MIN: "", Quality.DOM7: "7",
    Quality.MAJ7: "maj7", Quality.MIN7: "7",
}


def note_to_pitch_class(note: str) -> int:
    try:
        return _NOTE_TO_PC[note]
    except KeyError as exc:
        raise ValueError(f"Unknown note name: {note!r}") from exc


def pitch_class_to_note(pc: int, *, prefer_flats: bool) -> str:
    names = _FLAT_NAMES if prefer_flats else _SHARP_NAMES
    return names[pc % 12]


def key_prefers_flats(tonic: str, mode: str) -> bool:
    if mode == "major":
        return tonic in _MAJOR_FLAT_TONICS
    return tonic in _MINOR_FLAT_TONICS


def transpose_note(note: str, semitones: int, *, prefer_flats: bool) -> str:
    pc = (note_to_pitch_class(note) + semitones) % 12
    return pitch_class_to_note(pc, prefer_flats=prefer_flats)


def roman_numeral(root: str, quality: Quality, key_tonic: str, key_mode: str) -> str:
    offset = (note_to_pitch_class(root) - note_to_pitch_class(key_tonic)) % 12
    degrees = _MAJOR_DEGREES if key_mode == "major" else _MINOR_DEGREES
    base = degrees[offset]
    accidental = base[:-_numeral_len(base)] if _has_accidental(base) else ""
    numeral = base[len(accidental):]
    if quality not in _UPPERCASE_QUALITIES:
        numeral = numeral.lower()
    return f"{accidental}{numeral}{_SUFFIX[quality]}"


def _has_accidental(base: str) -> bool:
    return base[0] in ("#", "b")


def _numeral_len(base: str) -> int:
    return len(base) - 1 if _has_accidental(base) else len(base)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_music_theory.py -v`
Expected: PASS (all music-theory tests).

- [ ] **Step 5: Commit**

```bash
git add app/music_theory.py tests/test_music_theory.py
git commit -m "feat: pure music-theory engine (transpose + roman numerals)"
```

---

## Task 3: Persistence models

**Files:**
- Create: `app/models.py`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write the failing test** in `tests/test_models.py`

```python
from app.models import (
    Analysis,
    ChordChart,
    ChordSegment,
    Recording,
    Session as SessionModel,
    User,
)


def test_user_recording_chart_segment_relationships(db_session):
    user = User(username="alice", password_hash="x")
    db_session.add(user)
    db_session.flush()

    rec = Recording(
        user_id=user.id,
        original_filename="memo.m4a",
        format="m4a",
        stored_path="/tmp/memo.m4a",
        duration_seconds=12.5,
    )
    db_session.add(rec)
    db_session.flush()

    chart = ChordChart(recording_id=rec.id, key_tonic="C", key_mode="major")
    db_session.add(chart)
    db_session.flush()

    seg = ChordSegment(
        chart_id=chart.id,
        start_time=0.0,
        end_time=2.0,
        chord_root="C",
        chord_quality="maj",
    )
    db_session.add(seg)
    db_session.commit()

    assert rec.user is user
    assert chart.recording is rec
    assert seg.chart is chart
    assert chart.segments == [seg]


def test_session_belongs_to_user(db_session):
    user = User(username="bob", password_hash="x")
    db_session.add(user)
    db_session.flush()
    s = SessionModel(user_id=user.id, token_hash="abc")
    db_session.add(s)
    db_session.commit()
    assert s.user is user


def test_analysis_belongs_to_recording(db_session):
    user = User(username="carol", password_hash="x")
    db_session.add(user)
    db_session.flush()
    rec = Recording(
        user_id=user.id, original_filename="m.m4a", format="m4a",
        stored_path="/tmp/m.m4a", duration_seconds=5.0,
    )
    db_session.add(rec)
    db_session.flush()
    a = Analysis(recording_id=rec.id, status="done", bpm=120.0,
                 detected_key_tonic="C", detected_key_mode="major", engine_version="v1")
    db_session.add(a)
    db_session.commit()
    assert a.recording is rec
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_models.py -v`
Expected: FAIL with `ImportError`/`ModuleNotFoundError` for `app.models`.

- [ ] **Step 3: Implement `app/models.py`**

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    recordings: Mapped[list["Recording"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="sessions")


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    format: Mapped[str] = mapped_column(String, nullable=False)
    stored_path: Mapped[str] = mapped_column(String, nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="uploaded", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="recordings")
    analysis: Mapped["Analysis | None"] = relationship(
        back_populates="recording", cascade="all, delete-orphan", uselist=False
    )
    chart: Mapped["ChordChart | None"] = relationship(
        back_populates="recording", cascade="all, delete-orphan", uselist=False
    )


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    recording_id: Mapped[str] = mapped_column(
        ForeignKey("recordings.id"), unique=True, index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    detected_key_tonic: Mapped[str | None] = mapped_column(String, nullable=True)
    detected_key_mode: Mapped[str | None] = mapped_column(String, nullable=True)
    engine_version: Mapped[str | None] = mapped_column(String, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    recording: Mapped[Recording] = relationship(back_populates="analysis")


class ChordChart(Base):
    __tablename__ = "chord_charts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    recording_id: Mapped[str] = mapped_column(
        ForeignKey("recordings.id"), unique=True, index=True, nullable=False
    )
    key_tonic: Mapped[str] = mapped_column(String, nullable=False)
    key_mode: Mapped[str] = mapped_column(String, nullable=False)

    recording: Mapped[Recording] = relationship(back_populates="chart")
    segments: Mapped[list["ChordSegment"]] = relationship(
        back_populates="chart",
        cascade="all, delete-orphan",
        order_by="ChordSegment.start_time",
    )


class ChordSegment(Base):
    __tablename__ = "chord_segments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    chart_id: Mapped[str] = mapped_column(ForeignKey("chord_charts.id"), index=True, nullable=False)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    chord_root: Mapped[str] = mapped_column(String, nullable=False)
    chord_quality: Mapped[str] = mapped_column(String, nullable=False)

    chart: Mapped[ChordChart] = relationship(back_populates="segments")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_models.py -v`
Expected: PASS (all three relationship tests).

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: persistence models (user, session, recording, analysis, chart, segment)"
```

---

## Task 4: Security helpers

**Files:**
- Create: `app/security.py`
- Test: `tests/test_security.py`

- [ ] **Step 1: Write the failing tests** in `tests/test_security.py`

```python
from app.security import (
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("s3cret")
    assert h != "s3cret"
    assert verify_password("s3cret", h) is True
    assert verify_password("wrong", h) is False


def test_generate_session_token_is_random_and_long():
    a = generate_session_token()
    b = generate_session_token()
    assert a != b
    assert len(a) >= 32


def test_hash_token_is_deterministic():
    token = "abc123"
    assert hash_token(token) == hash_token(token)
    assert hash_token(token) != hash_token("different")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_security.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.security'`.

- [ ] **Step 3: Implement `app/security.py`**

```python
import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Deterministic hash for storing/looking up session tokens (not a password)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_security.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/security.py tests/test_security.py
git commit -m "feat: password hashing and session-token helpers"
```

---

## Task 5: Pydantic schemas and current-user dependency

**Files:**
- Create: `app/schemas.py`
- Create: `app/deps.py`

- [ ] **Step 1: Create `app/schemas.py`**

```python
from pydantic import BaseModel, ConfigDict, Field


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str


class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    original_filename: str
    format: str
    duration_seconds: float | None
    status: str


class ChartCreate(BaseModel):
    key_tonic: str = Field(min_length=1, max_length=2)
    key_mode: str = Field(pattern="^(major|minor)$")


class SegmentCreate(BaseModel):
    start_time: float = Field(ge=0)
    end_time: float = Field(gt=0)
    chord_root: str = Field(min_length=1, max_length=2)
    chord_quality: str = Field(pattern="^(maj|min|dom7|maj7|min7)$")


class SegmentUpdate(BaseModel):
    start_time: float | None = Field(default=None, ge=0)
    end_time: float | None = Field(default=None, gt=0)
    chord_root: str | None = Field(default=None, min_length=1, max_length=2)
    chord_quality: str | None = Field(default=None, pattern="^(maj|min|dom7|maj7|min7)$")


class SegmentOut(BaseModel):
    id: str
    start_time: float
    end_time: float
    chord_root: str
    chord_quality: str
    roman_numeral: str


class ChartOut(BaseModel):
    id: str
    recording_id: str
    key_tonic: str
    key_mode: str
    segments: list[SegmentOut]


class TransposeRequest(BaseModel):
    semitones: int = Field(ge=-11, le=11)
```

- [ ] **Step 2: Write the failing test** in `tests/test_deps.py`

```python
def test_protected_route_requires_session(client):
    # /api/auth/me is the canonical protected route; without a cookie -> 401
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pytest tests/test_deps.py -v`
Expected: FAIL — currently 404 (route not registered yet), not 401. This confirms the route/dependency does not exist.

- [ ] **Step 4: Implement `app/deps.py`**

```python
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.db import get_db
from app.models import Session as SessionModel, User
from app.security import hash_token

_settings = get_settings()


def get_current_user(
    db: DbSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=_settings.session_cookie_name),
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    row = db.execute(
        select(SessionModel).where(SessionModel.token_hash == hash_token(session_token))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return row.user
```

Note: the `test_deps.py` test will pass once Task 6 registers the auth router; for now verify the dependency imports cleanly:

Run: `python -c "import app.deps; import app.schemas; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add app/schemas.py app/deps.py tests/test_deps.py
git commit -m "feat: API schemas and current-user dependency"
```

---

## Task 6: Auth router (register, login, logout, me)

Registration auto-logs-in. Login/register set a long-lived httpOnly cookie. Logout deletes the session row (server-side revocation) and clears the cookie.

**Files:**
- Create: `app/routers/__init__.py` (empty)
- Create: `app/routers/auth.py`
- Modify: `app/main.py` (register the auth router)
- Test: `tests/test_auth.py`

- [ ] **Step 1: Write the failing tests** in `tests/test_auth.py`

```python
def test_register_then_me(client):
    resp = client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
    assert resp.status_code == 201
    assert resp.json()["username"] == "alice"
    # cookie set -> me works on the same client
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


def test_register_duplicate_username_rejected(client):
    client.post("/api/auth/register", json={"username": "bob", "password": "password123"})
    resp = client.post("/api/auth/register", json={"username": "bob", "password": "password123"})
    assert resp.status_code == 409


def test_login_wrong_password_rejected(client):
    client.post("/api/auth/register", json={"username": "carol", "password": "password123"})
    client.post("/api/auth/logout")
    resp = client.post("/api/auth/login", json={"username": "carol", "password": "wrongpass1"})
    assert resp.status_code == 401


def test_login_sets_cookie_and_me_works(client):
    client.post("/api/auth/register", json={"username": "dave", "password": "password123"})
    client.post("/api/auth/logout")
    resp = client.post("/api/auth/login", json={"username": "dave", "password": "password123"})
    assert resp.status_code == 200
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "dave"


def test_logout_revokes_session(client):
    client.post("/api/auth/register", json={"username": "erin", "password": "password123"})
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_auth.py -v`
Expected: FAIL — 404 (auth routes not registered).

- [ ] **Step 3: Implement `app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Session as SessionModel, User
from app.schemas import Credentials, UserOut
from app.security import (
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
_settings = get_settings()


def _start_session(db: DbSession, user: User, response: Response) -> None:
    token = generate_session_token()
    db.add(SessionModel(user_id=user.id, token_hash=hash_token(token)))
    db.commit()
    response.set_cookie(
        key=_settings.session_cookie_name,
        value=token,
        max_age=_settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=_settings.cookie_secure,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(creds: Credentials, response: Response, db: DbSession = Depends(get_db)) -> User:
    exists = db.execute(select(User).where(User.username == creds.username)).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username taken")
    user = User(username=creds.username, password_hash=hash_password(creds.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    _start_session(db, user, response)
    return user


@router.post("/login", response_model=UserOut)
def login(creds: Credentials, response: Response, db: DbSession = Depends(get_db)) -> User:
    user = db.execute(select(User).where(User.username == creds.username)).scalar_one_or_none()
    if user is None or not verify_password(creds.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    _start_session(db, user, response)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    # Revoke all sessions for this user (simple + safe for v1).
    for s in list(user.sessions):
        db.delete(s)
    db.commit()
    response.delete_cookie(_settings.session_cookie_name)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
```

- [ ] **Step 4: Register the router in `app/main.py`**

Replace the contents of `app/main.py` with:

```python
from fastapi import FastAPI

from app.routers import auth

app = FastAPI(title="Tabit")
app.include_router(auth.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Run the auth and deps tests to verify they pass**

Run: `pytest tests/test_auth.py tests/test_deps.py -v`
Expected: PASS (all auth tests + `test_protected_route_requires_session`).

- [ ] **Step 6: Commit**

```bash
git add app/routers app/main.py tests/test_auth.py
git commit -m "feat: auth router with persistent revocable sessions"
```

---

## Task 7: Storage helper and recordings router

Upload stores the file under `storage_dir/<user_id>/<recording_id>.<ext>`. Duration is supplied as a form field in this plan (Plan 2's analysis will set it from the audio). All access is scoped to the current user.

**Files:**
- Create: `app/storage.py`
- Create: `app/routers/recordings.py`
- Modify: `app/main.py` (register recordings router)
- Test: `tests/test_recordings.py`

- [ ] **Step 1: Write the failing tests** in `tests/test_recordings.py`

```python
import io


def _register(client, username="alice"):
    client.post("/api/auth/register", json={"username": username, "password": "password123"})


def _upload(client, name="memo.m4a", duration=10.0):
    return client.post(
        "/api/recordings",
        files={"file": (name, io.BytesIO(b"fake-audio-bytes"), "audio/mp4")},
        data={"duration_seconds": str(duration)},
    )


def test_upload_creates_recording(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    resp = _upload(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["original_filename"] == "memo.m4a"
    assert body["format"] == "m4a"
    assert body["duration_seconds"] == 10.0
    assert body["status"] == "uploaded"


def test_upload_requires_auth(client):
    resp = _upload(client)
    assert resp.status_code == 401


def test_list_only_returns_own_recordings(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    _upload(client, "a.m4a")
    client.post("/api/auth/logout")
    _register(client, "bob")
    _upload(client, "b.m4a")
    listing = client.get("/api/recordings").json()
    assert len(listing) == 1
    assert listing[0]["original_filename"] == "b.m4a"


def test_get_other_users_recording_is_404(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    rec_id = _upload(client, "a.m4a").json()["id"]
    client.post("/api/auth/logout")
    _register(client, "bob")
    assert client.get(f"/api/recordings/{rec_id}").status_code == 404


def test_delete_recording(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]
    assert client.delete(f"/api/recordings/{rec_id}").status_code == 204
    assert client.get(f"/api/recordings/{rec_id}").status_code == 404
```

Note: `monkeypatch.setenv` only affects newly constructed `Settings`. Because `get_settings` is cached, the storage module must read the storage dir at call time. Implement accordingly in Step 3 (read `get_settings().storage_dir` inside the save function, and clear the cache in a fixture). Add to `tests/conftest.py`:

```python
@pytest.fixture(autouse=True)
def _clear_settings_cache():
    from app.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_recordings.py -v`
Expected: FAIL — 404 (recordings routes not registered).

- [ ] **Step 3: Implement `app/storage.py`**

```python
import os
from pathlib import Path

from app.config import get_settings


def save_audio(user_id: str, recording_id: str, ext: str, data: bytes) -> str:
    base = Path(get_settings().storage_dir) / user_id
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{recording_id}.{ext}"
    path.write_bytes(data)
    return str(path)


def delete_audio(stored_path: str) -> None:
    try:
        os.remove(stored_path)
    except FileNotFoundError:
        pass
```

- [ ] **Step 4: Implement `app/routers/recordings.py`**

```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db import get_db
from app.deps import get_current_user
from app.models import Recording, User
from app.schemas import RecordingOut
from app.storage import delete_audio, save_audio

router = APIRouter(prefix="/api/recordings", tags=["recordings"])


def _get_owned_recording(db: DbSession, user: User, recording_id: str) -> Recording:
    rec = db.execute(
        select(Recording).where(
            Recording.id == recording_id, Recording.user_id == user.id
        )
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return rec


@router.get("", response_model=list[RecordingOut])
def list_recordings(
    db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Recording]:
    return list(
        db.execute(
            select(Recording).where(Recording.user_id == user.id).order_by(Recording.created_at.desc())
        ).scalars()
    )


@router.post("", response_model=RecordingOut, status_code=status.HTTP_201_CREATED)
def upload_recording(
    file: UploadFile = File(...),
    duration_seconds: float | None = Form(default=None),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Recording:
    filename = file.filename or "recording"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    rec = Recording(
        user_id=user.id,
        original_filename=filename,
        format=ext,
        stored_path="",
        duration_seconds=duration_seconds,
    )
    db.add(rec)
    db.flush()  # assign rec.id
    rec.stored_path = save_audio(user.id, rec.id, ext, file.file.read())
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/{recording_id}", response_model=RecordingOut)
def get_recording(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> Recording:
    return _get_owned_recording(db, user, recording_id)


@router.delete("/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recording(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    rec = _get_owned_recording(db, user, recording_id)
    delete_audio(rec.stored_path)
    db.delete(rec)
    db.commit()
```

- [ ] **Step 5: Register the router in `app/main.py`**

Update `app/main.py` to also include recordings:

```python
from fastapi import FastAPI

from app.routers import auth, recordings

app = FastAPI(title="Tabit")
app.include_router(auth.router)
app.include_router(recordings.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run the recordings tests to verify they pass**

Run: `pytest tests/test_recordings.py -v`
Expected: PASS (all five recordings tests).

- [ ] **Step 7: Commit**

```bash
git add app/storage.py app/routers/recordings.py app/main.py tests/test_recordings.py tests/conftest.py
git commit -m "feat: recordings upload/list/get/delete scoped to user"
```

---

## Task 8: Charts router — create, read, segment CRUD, transpose

The chart response computes each segment's roman numeral from the chart key via `music_theory.roman_numeral`. Segment validation: `0 <= start_time < end_time`, `end_time <= recording.duration_seconds` (when known), and no overlap with sibling segments. Transpose shifts the chart key and every segment root by N semitones, spelling notes for the new key.

**Files:**
- Create: `app/routers/charts.py`
- Modify: `app/main.py` (register charts router)
- Test: `tests/test_charts.py`

- [ ] **Step 1: Write the failing tests** in `tests/test_charts.py`

```python
import io


def _register(client, username="alice"):
    client.post("/api/auth/register", json={"username": username, "password": "password123"})


def _upload(client, duration=10.0):
    return client.post(
        "/api/recordings",
        files={"file": ("memo.m4a", io.BytesIO(b"fake"), "audio/mp4")},
        data={"duration_seconds": str(duration)},
    ).json()["id"]


def _make_chart(client, monkeypatch, tmp_path):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client)
    resp = client.post(f"/api/recordings/{rec_id}/chart", json={"key_tonic": "C", "key_mode": "major"})
    assert resp.status_code == 201
    return rec_id, resp.json()["id"]


def test_create_and_get_chart(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    chart = client.get(f"/api/recordings/{rec_id}/chart").json()
    assert chart["key_tonic"] == "C"
    assert chart["segments"] == []


def test_add_segment_computes_roman_numeral(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    resp = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_time": 0.0, "end_time": 2.0, "chord_root": "G", "chord_quality": "dom7"},
    )
    assert resp.status_code == 201
    assert resp.json()["roman_numeral"] == "V7"


def test_add_overlapping_segment_rejected(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_time": 0.0, "end_time": 4.0, "chord_root": "C", "chord_quality": "maj"},
    )
    resp = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_time": 2.0, "end_time": 6.0, "chord_root": "F", "chord_quality": "maj"},
    )
    assert resp.status_code == 422


def test_segment_beyond_duration_rejected(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    resp = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_time": 0.0, "end_time": 99.0, "chord_root": "C", "chord_quality": "maj"},
    )
    assert resp.status_code == 422


def test_update_segment_chord(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    seg_id = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_time": 0.0, "end_time": 2.0, "chord_root": "C", "chord_quality": "maj"},
    ).json()["id"]
    resp = client.patch(
        f"/api/charts/{chart_id}/segments/{seg_id}",
        json={"chord_root": "A", "chord_quality": "min"},
    )
    assert resp.status_code == 200
    assert resp.json()["roman_numeral"] == "vi"


def test_delete_segment(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    seg_id = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_time": 0.0, "end_time": 2.0, "chord_root": "C", "chord_quality": "maj"},
    ).json()["id"]
    assert client.delete(f"/api/charts/{chart_id}/segments/{seg_id}").status_code == 204
    assert client.get(f"/api/recordings/{rec_id}/chart").json()["segments"] == []


def test_transpose_shifts_key_and_chords_but_keeps_numerals(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    for root in (("C", 0.0, 2.0), ("F", 2.0, 4.0), ("G", 4.0, 6.0)):
        client.post(
            f"/api/charts/{chart_id}/segments",
            json={"start_time": root[1], "end_time": root[2], "chord_root": root[0], "chord_quality": "maj"},
        )
    resp = client.post(f"/api/charts/{chart_id}/transpose", json={"semitones": 2})
    assert resp.status_code == 200
    chart = resp.json()
    assert chart["key_tonic"] == "D"
    roots = [s["chord_root"] for s in chart["segments"]]
    numerals = [s["roman_numeral"] for s in chart["segments"]]
    assert roots == ["D", "G", "A"]
    assert numerals == ["I", "IV", "V"]  # functional labels unchanged


def test_chart_access_scoped_to_owner(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    client.post("/api/auth/logout")
    _register(client, "intruder")
    assert client.get(f"/api/recordings/{rec_id}/chart").status_code == 404
    assert client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_time": 0.0, "end_time": 1.0, "chord_root": "C", "chord_quality": "maj"},
    ).status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_charts.py -v`
Expected: FAIL — 404 (chart routes not registered).

- [ ] **Step 3: Implement `app/routers/charts.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db import get_db
from app.deps import get_current_user
from app.models import ChordChart, ChordSegment, Recording, User
from app.music_theory import Quality, key_prefers_flats, roman_numeral, transpose_note
from app.schemas import (
    ChartCreate,
    ChartOut,
    SegmentCreate,
    SegmentOut,
    SegmentUpdate,
    TransposeRequest,
)

router = APIRouter(prefix="/api", tags=["charts"])


def _segment_out(seg: ChordSegment, chart: ChordChart) -> SegmentOut:
    return SegmentOut(
        id=seg.id,
        start_time=seg.start_time,
        end_time=seg.end_time,
        chord_root=seg.chord_root,
        chord_quality=seg.chord_quality,
        roman_numeral=roman_numeral(
            seg.chord_root, Quality(seg.chord_quality), chart.key_tonic, chart.key_mode
        ),
    )


def _chart_out(chart: ChordChart) -> ChartOut:
    return ChartOut(
        id=chart.id,
        recording_id=chart.recording_id,
        key_tonic=chart.key_tonic,
        key_mode=chart.key_mode,
        segments=[_segment_out(s, chart) for s in chart.segments],
    )


def _owned_recording(db: DbSession, user: User, recording_id: str) -> Recording:
    rec = db.execute(
        select(Recording).where(Recording.id == recording_id, Recording.user_id == user.id)
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return rec


def _owned_chart(db: DbSession, user: User, chart_id: str) -> ChordChart:
    chart = db.execute(
        select(ChordChart)
        .join(Recording, ChordChart.recording_id == Recording.id)
        .where(ChordChart.id == chart_id, Recording.user_id == user.id)
    ).scalar_one_or_none()
    if chart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart not found")
    return chart


def _validate_segment_window(
    chart: ChordChart, start: float, end: float, duration: float | None, exclude_id: str | None
) -> None:
    if start >= end:
        raise HTTPException(status_code=422, detail="start_time must be before end_time")
    if duration is not None and end > duration:
        raise HTTPException(status_code=422, detail="end_time exceeds recording duration")
    for other in chart.segments:
        if other.id == exclude_id:
            continue
        if start < other.end_time and end > other.start_time:
            raise HTTPException(status_code=422, detail="segment overlaps an existing segment")


@router.post(
    "/recordings/{recording_id}/chart",
    response_model=ChartOut,
    status_code=status.HTTP_201_CREATED,
)
def create_chart(
    recording_id: str,
    payload: ChartCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    rec = _owned_recording(db, user, recording_id)
    if rec.chart is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Chart already exists")
    chart = ChordChart(recording_id=rec.id, key_tonic=payload.key_tonic, key_mode=payload.key_mode)
    db.add(chart)
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)


@router.get("/recordings/{recording_id}/chart", response_model=ChartOut)
def get_chart(
    recording_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    rec = _owned_recording(db, user, recording_id)
    if rec.chart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart not found")
    return _chart_out(rec.chart)


@router.post(
    "/charts/{chart_id}/segments", response_model=SegmentOut, status_code=status.HTTP_201_CREATED
)
def add_segment(
    chart_id: str,
    payload: SegmentCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SegmentOut:
    chart = _owned_chart(db, user, chart_id)
    _validate_segment_window(
        chart, payload.start_time, payload.end_time, chart.recording.duration_seconds, None
    )
    seg = ChordSegment(
        chart_id=chart.id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        chord_root=payload.chord_root,
        chord_quality=payload.chord_quality,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return _segment_out(seg, chart)


@router.patch("/charts/{chart_id}/segments/{segment_id}", response_model=SegmentOut)
def update_segment(
    chart_id: str,
    segment_id: str,
    payload: SegmentUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SegmentOut:
    chart = _owned_chart(db, user, chart_id)
    seg = next((s for s in chart.segments if s.id == segment_id), None)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    new_start = payload.start_time if payload.start_time is not None else seg.start_time
    new_end = payload.end_time if payload.end_time is not None else seg.end_time
    _validate_segment_window(
        chart, new_start, new_end, chart.recording.duration_seconds, exclude_id=seg.id
    )
    seg.start_time = new_start
    seg.end_time = new_end
    if payload.chord_root is not None:
        seg.chord_root = payload.chord_root
    if payload.chord_quality is not None:
        seg.chord_quality = payload.chord_quality
    db.commit()
    db.refresh(seg)
    return _segment_out(seg, chart)


@router.delete(
    "/charts/{chart_id}/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_segment(
    chart_id: str,
    segment_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    chart = _owned_chart(db, user, chart_id)
    seg = next((s for s in chart.segments if s.id == segment_id), None)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    db.delete(seg)
    db.commit()


@router.post("/charts/{chart_id}/transpose", response_model=ChartOut)
def transpose_chart(
    chart_id: str,
    payload: TransposeRequest,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    chart = _owned_chart(db, user, chart_id)
    new_tonic = transpose_note(
        chart.key_tonic,
        payload.semitones,
        prefer_flats=key_prefers_flats(
            transpose_note(chart.key_tonic, payload.semitones, prefer_flats=False), chart.key_mode
        ),
    )
    prefer_flats = key_prefers_flats(new_tonic, chart.key_mode)
    chart.key_tonic = new_tonic
    for seg in chart.segments:
        seg.chord_root = transpose_note(seg.chord_root, payload.semitones, prefer_flats=prefer_flats)
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)
```

- [ ] **Step 4: Register the router in `app/main.py`**

Update `app/main.py` to include charts:

```python
from fastapi import FastAPI

from app.routers import auth, charts, recordings

app = FastAPI(title="Tabit")
app.include_router(auth.router)
app.include_router(recordings.router)
app.include_router(charts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Run the chart tests to verify they pass**

Run: `pytest tests/test_charts.py -v`
Expected: PASS (all chart tests, including transpose keeping numerals `I IV V`).

- [ ] **Step 6: Commit**

```bash
git add app/routers/charts.py app/main.py tests/test_charts.py
git commit -m "feat: chord chart create/read, segment CRUD, and transpose"
```

---

## Task 9: DB bootstrap, run docs, and full suite

**Files:**
- Modify: `app/main.py` (create tables on startup)
- Create: `README.md`

- [ ] **Step 1: Add table creation on startup in `app/main.py`**

Replace `app/main.py` with:

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import Base, engine
from app.routers import auth, charts, recordings


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Tabit", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(recordings.router)
app.include_router(charts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Tabit — backend

Turn practice voice memos into editable chord charts.

## Setup

    python -m venv .venv && . .venv/bin/activate
    pip install -e ".[dev]"

## Run

    uvicorn app.main:app --reload

API docs at http://localhost:8000/docs

## Test

    pytest

## Config (env vars, prefix `TABIT_`)

- `TABIT_DATABASE_URL` (default `sqlite:///./tabit.db`)
- `TABIT_STORAGE_DIR` (default `./storage`)
- `TABIT_COOKIE_SECURE` (`true` behind HTTPS)
```

- [ ] **Step 3: Run the full test suite**

Run: `pytest`
Expected: PASS — all tests across health, music theory, security, models, deps, auth, recordings, charts.

- [ ] **Step 4: Smoke-test the running app**

Run:
```bash
uvicorn app.main:app --port 8000 &
sleep 2
curl -s localhost:8000/api/health
kill %1
```
Expected: `{"status":"ok"}` and a `tabit.db` file created.

- [ ] **Step 5: Commit**

```bash
git add app/main.py README.md
git commit -m "feat: create tables on startup; add README"
```

---

## Self-Review Notes (resolved)

- **Spec coverage:** Multi-user auth (Task 6), persistent revocable sessions (Tasks 4–6, cookie max-age = 1 year, logout deletes session rows), per-user scoping (Tasks 7–8 via `user_id` filters / ownership joins), SQLite persistence + per-user file storage (Tasks 1, 3, 7), music-theory transpose + roman numerals (Task 2), editable charts/segments + boundary times + transpose-keeps-numerals (Task 8). Analysis, BPM, key detection, and the recognizer interface are intentionally **deferred to Plan 2**; the `Analysis` model and `Recording.status` exist now so Plan 2 attaches cleanly.
- **Type consistency:** `Quality` StrEnum values (`maj/min/dom7/maj7/min7`) match schema regex patterns and chart serialization. `roman_numeral(root, quality, key_tonic, key_mode)` and `transpose_note(note, semitones, *, prefer_flats)` signatures are used consistently across Tasks 2 and 8. Session cookie name flows from `Settings.session_cookie_name` through `auth.py` and `deps.py`.
- **Placeholders:** none — every step contains complete code or an exact command with expected output.

## Out of Scope (this plan)

- Audio decoding, BPM/key detection, chord recognition, background jobs, chart seeding, re-run analysis → **Plan 2**.
- React frontend → **Plan 3**.
- Role-based permissions / admin UI.
```

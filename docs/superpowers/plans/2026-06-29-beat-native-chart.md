# Beat-native chord chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make beats the source of truth for chord length so the chart reads like a lead sheet — chords sized in beats, rhythm slashes per beat, and bar lines per measure.

**Architecture:** Analysis persists librosa's detected beat-onset times (`beat_times`). Chords store `start_beat`/`end_beat` (multiples of 0.5); seconds are derived from the beat grid at API-serialization time via a new pure `beatgrid` module. The frontend sizes cells by beat count, draws bar lines every `beats_per_measure` beats (phase-shifted by `measure_offset`), and edits in beats.

**Tech Stack:** Backend — FastAPI, SQLAlchemy 2.0, Pydantic v2, librosa/numpy, pytest. Frontend — React 18 + TypeScript, Vite, TanStack Query, Vitest.

## Global Constraints

- Python ≥ 3.12; use the project `.venv` (no `python` on PATH — invoke `.venv/bin/python` / `.venv/bin/pytest`).
- `Analysis` is immutable; `ChordChart` is the editable copy. Re-analysis creates a fresh `Analysis` and re-seeds the chart, overwriting manual edits.
- Beat positions are quantized to multiples of **0.5** beats everywhere they are stored or accepted.
- `beats_per_measure` defaults to **4**; `measure_offset` defaults to **0**.
- A chart's segments must never exceed the beat grid's reachable extent (the beat at `recording.duration_seconds`).
- Chord boundaries reflect actual change points; leading/trailing silence is trimmed before beats are assigned.
- No Alembic in the project — tables come from `Base.metadata.create_all`. New columns must be additive so existing DBs can be migrated with a small script.
- Run frontend tests with `cd frontend && npm test -- --run`; backend tests with `.venv/bin/pytest`.

---

## File Structure

**Backend**
- Create `app/audio/beatgrid.py` — pure beat↔time conversion + snapping (no I/O).
- Modify `app/audio/analyzer.py` — capture `beat_times` into `AnalysisResult`.
- Modify `app/models.py` — new columns; `order_by` change.
- Modify `app/jobs.py` — persist `beat_times`; seed chords in beats.
- Modify `app/schemas.py` — beat fields on segment/chart/analysis shapes; new chart-settings payload.
- Modify `app/routers/charts.py` — derive seconds, validate in beats, chart-settings PATCH, reorder in beats.
- Create `scripts/migrate_beats.py` — additive column migration for existing `tabit.db`.

**Frontend**
- Modify `frontend/src/api/types.ts` — new fields.
- Modify `frontend/src/chart/useChart.ts` — beat-based segment input/patch + chart-settings mutation.
- Create `frontend/src/chart/beatMath.ts` — beat snapping/clamping + slash-mark helper.
- Modify `frontend/src/chart/chartLayout.ts` — measure-aware line wrapping + beat-based boundary updates.
- Modify `frontend/src/chart/Timeline.tsx` — size by beats, slash marks, bar lines, beat-snapped resize.
- Modify `frontend/src/chart/SegmentEditor.tsx` — beat-count stepper.
- Create `frontend/src/chart/TimeSignatureControl.tsx` — beats-per-measure + measure-phase controls.
- Modify `frontend/src/pages/ChartEditorPage.tsx` — wire beats, new controls, beat-based "Add segment".

---

## Task 1: `beatgrid` conversion module

**Files:**
- Create: `app/audio/beatgrid.py`
- Test: `tests/test_beatgrid.py`

**Interfaces:**
- Produces:
  - `ensure_grid(beat_times: list[float], bpm: float | None, duration: float) -> list[float]` — returns an ascending grid with ≥ 2 entries; synthesizes a uniform grid from `bpm` (or 120 if `bpm` is falsy) spanning `[0, duration]` when fewer than 2 onsets are supplied.
  - `time_for_beat(beat: float, grid: list[float], duration: float) -> float` — beat index → seconds (linear interp inside the grid, last-interval extrapolation beyond it), clamped to `[0, duration]`.
  - `beat_for_time(time: float, grid: list[float]) -> float` — seconds → fractional beat (inverse of the above; extrapolates beyond the last onset; clamps to ≥ 0).
  - `snap_half(beat: float) -> float` — round to the nearest 0.5.
  - `total_beats(grid: list[float], duration: float) -> float` — `beat_for_time(duration, grid)`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_beatgrid.py
import pytest

from app.audio.beatgrid import (
    beat_for_time,
    ensure_grid,
    snap_half,
    time_for_beat,
    total_beats,
)

# A steady 120 BPM grid: one beat every 0.5s, beat 0 at t=0.
GRID = [0.0, 0.5, 1.0, 1.5, 2.0]


def test_time_for_beat_on_grid():
    assert time_for_beat(0, GRID, 2.0) == pytest.approx(0.0)
    assert time_for_beat(2, GRID, 2.0) == pytest.approx(1.0)


def test_time_for_beat_half_beat_interpolates():
    assert time_for_beat(1.5, GRID, 2.0) == pytest.approx(0.75)


def test_time_for_beat_extrapolates_past_last_onset():
    # Beat 6 is two beats past the last onset (beat 4 @ 2.0), interval 0.5 -> 3.0,
    # but clamped to duration.
    assert time_for_beat(6, GRID, 10.0) == pytest.approx(3.0)
    assert time_for_beat(6, GRID, 2.5) == pytest.approx(2.5)


def test_beat_for_time_is_inverse():
    assert beat_for_time(0.75, GRID) == pytest.approx(1.5)
    assert beat_for_time(1.0, GRID) == pytest.approx(2.0)


def test_beat_for_time_extrapolates_and_clamps():
    assert beat_for_time(3.0, GRID) == pytest.approx(6.0)
    assert beat_for_time(-1.0, GRID) == pytest.approx(0.0)


def test_snap_half():
    assert snap_half(1.24) == 1.0
    assert snap_half(1.26) == 1.5
    assert snap_half(1.75) == 2.0


def test_ensure_grid_synthesizes_when_too_few_onsets():
    grid = ensure_grid([], bpm=120.0, duration=2.0)
    assert grid[0] == 0.0
    assert grid[1] == pytest.approx(0.5)
    assert grid[-1] >= 2.0


def test_ensure_grid_keeps_real_onsets():
    assert ensure_grid(GRID, bpm=120.0, duration=2.0) == GRID


def test_total_beats():
    assert total_beats(GRID, 1.0) == pytest.approx(2.0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_beatgrid.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.audio.beatgrid'`.

- [ ] **Step 3: Implement `beatgrid.py`**

```python
# app/audio/beatgrid.py
"""Pure beat<->time conversion over a detected beat-onset grid.

A *grid* is an ascending list of beat-onset times in seconds; index i is beat i.
Positions between or beyond onsets are linearly interpolated / extrapolated using
the surrounding (or final) inter-beat interval. All times are in original-audio
seconds; callers shift detected onsets to that frame before building the grid.
"""

from __future__ import annotations

import bisect

_DEFAULT_BPM = 120.0


def snap_half(beat: float) -> float:
    """Round a beat position to the nearest half-beat (eighth)."""
    return round(beat * 2.0) / 2.0


def ensure_grid(beat_times: list[float], bpm: float | None, duration: float) -> list[float]:
    """Return a usable grid (>= 2 ascending entries).

    When detection produced fewer than two onsets, synthesize a uniform grid from
    `bpm` (falling back to 120 BPM) anchored at t=0 and spanning past `duration`.
    """
    clean = sorted(float(t) for t in beat_times)
    if len(clean) >= 2:
        return clean
    tempo = bpm if bpm and bpm > 0 else _DEFAULT_BPM
    interval = 60.0 / tempo
    span = max(duration, interval * 2)
    n = int(span / interval) + 2
    return [round(i * interval, 6) for i in range(n)]


def _interval(grid: list[float], i: int) -> float:
    """Inter-beat interval at index i, falling back to the final interval."""
    if 0 <= i < len(grid) - 1:
        step = grid[i + 1] - grid[i]
    else:
        step = grid[-1] - grid[-2]
    return step if step > 0 else 60.0 / _DEFAULT_BPM


def time_for_beat(beat: float, grid: list[float], duration: float) -> float:
    """Beat index -> seconds, clamped to [0, duration]."""
    if beat <= 0:
        return 0.0
    last = len(grid) - 1
    if beat >= last:
        seconds = grid[-1] + (beat - last) * _interval(grid, last)
    else:
        i = int(beat)
        seconds = grid[i] + (beat - i) * _interval(grid, i)
    return max(0.0, min(duration, seconds))


def beat_for_time(time: float, grid: list[float]) -> float:
    """Seconds -> fractional beat (inverse of time_for_beat), clamped to >= 0."""
    if time <= grid[0]:
        return 0.0
    if time >= grid[-1]:
        return (len(grid) - 1) + (time - grid[-1]) / _interval(grid, len(grid) - 1)
    i = bisect.bisect_right(grid, time) - 1
    return i + (time - grid[i]) / _interval(grid, i)


def total_beats(grid: list[float], duration: float) -> float:
    """The fractional beat reached at `duration` — the chart's maximum end_beat."""
    return beat_for_time(duration, grid)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_beatgrid.py -q`
Expected: PASS (10 passed).

- [ ] **Step 5: Commit**

```bash
git add app/audio/beatgrid.py tests/test_beatgrid.py
git commit -m "feat(beatgrid): pure beat<->time conversion with half-beat snapping"
```

---

## Task 2: Capture `beat_times` in the analyzer

**Files:**
- Modify: `app/audio/analyzer.py`
- Test: `tests/test_analyzer.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AnalysisResult.beat_times: list[float]` — detected beat-onset times in original-audio seconds (shifted by the silence-trim lead for `LibrosaAnalyzer`).

- [ ] **Step 1: Write the failing test**

```python
# add to tests/test_analyzer.py
def test_analysis_result_has_beat_times_field():
    from app.audio.analyzer import AnalysisResult
    r = AnalysisResult(bpm=120.0, key_tonic_pc=0, key_mode="major", duration=2.0)
    assert r.beat_times == []
```

Then add an integration-style assertion to the existing analyzer test that runs `LibrosaAnalyzer` on a synthesized signal (mirror the file's existing pattern — reuse its fixture/helper). Append:

```python
def test_librosa_analyzer_returns_ascending_beat_times(tmp_path):
    # Reuse the module's existing helper for writing a short tonal wav.
    path = _write_tone_wav(tmp_path)  # existing helper in this test file
    from app.audio.analyzer import LibrosaAnalyzer
    result = LibrosaAnalyzer(sample_rate=22050).analyze(str(path))
    assert result.beat_times == sorted(result.beat_times)
    assert all(t >= 0 for t in result.beat_times)
```

> If `tests/test_analyzer.py` has no `_write_tone_wav` helper, use whatever fixture the existing `LibrosaAnalyzer` test in that file already uses to produce audio; do not invent a new one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_analyzer.py -q`
Expected: FAIL — `TypeError`/`AttributeError` on the unknown `beat_times` field.

- [ ] **Step 3: Add the field and populate it**

In `app/audio/analyzer.py`, add to `AnalysisResult`:

```python
@dataclass(frozen=True)
class AnalysisResult:
    bpm: float
    key_tonic_pc: int
    key_mode: str
    duration: float
    segments: list[DetectedSegment] = field(default_factory=list)
    engine_version: str = ENGINE_VERSION
    beat_times: list[float] = field(default_factory=list)
```

In `LibrosaAnalyzer.analyze`, change the beat-tracking call to request beat times and shift them by the silence-trim lead (they are detected on `y_trim`):

```python
        tempo, beat_frames = librosa.beat.beat_track(y=y_trim, sr=self._sr, units="time")
        bpm = float(np.atleast_1d(tempo)[0])
        beat_times = [float(t) + lead for t in np.atleast_1d(beat_frames)]
```

Then pass `beat_times` into both `AnalysisResult` returns in this method:

```python
        if scores.shape[1] == 0:
            return AnalysisResult(bpm, tonic_pc, mode, duration, [], beat_times=beat_times)
        ...
        return AnalysisResult(bpm, tonic_pc, mode, duration, segments, beat_times=beat_times)
```

In `ChordinoAnalyzer.analyze` (no silence trim there), capture beats on the full signal:

```python
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=self._sr, units="time")
        bpm = float(np.atleast_1d(tempo)[0])
        beat_times = [float(t) for t in np.atleast_1d(beat_frames)]
```

and pass `beat_times=beat_times` into its `AnalysisResult(...)` return.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_analyzer.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/audio/analyzer.py tests/test_analyzer.py
git commit -m "feat(analyzer): capture detected beat onset times in AnalysisResult"
```

---

## Task 3: Beat-native columns on the models

**Files:**
- Modify: `app/models.py`
- Test: `tests/test_models.py`

**Interfaces:**
- Produces:
  - `Analysis.beat_times: list[float]` (JSON, default `[]`).
  - `ChordChart.beats_per_measure: int` (default 4), `ChordChart.measure_offset: int` (default 0), `ChordChart.beat_times: list[float]` (JSON, default `[]`).
  - `ChordSegment.start_beat: float`, `ChordSegment.end_beat: float`; `start_time`/`end_time` columns removed; `segments` relationship `order_by="ChordSegment.start_beat"`.

- [ ] **Step 1: Write the failing test**

```python
# add to tests/test_models.py
def test_chart_and_segment_have_beat_fields(db_session):
    from app.models import ChordChart, ChordSegment, Recording, User

    user = User(username="bob", password_hash="x")
    db_session.add(user)
    db_session.flush()
    rec = Recording(
        user_id=user.id, original_filename="m.m4a", format="m4a",
        stored_path="/tmp/m.m4a", duration_seconds=8.0,
    )
    db_session.add(rec)
    db_session.flush()
    chart = ChordChart(
        recording_id=rec.id, key_tonic="C", key_mode="major",
        beat_times=[0.0, 0.5, 1.0], beats_per_measure=4, measure_offset=0,
    )
    db_session.add(chart)
    db_session.flush()
    seg = ChordSegment(chart_id=chart.id, start_beat=0.0, end_beat=4.0,
                       chord_root="C", chord_quality="maj")
    db_session.add(seg)
    db_session.commit()

    assert chart.beats_per_measure == 4
    assert chart.beat_times == [0.0, 0.5, 1.0]
    assert chart.segments[0].end_beat == 4.0
```

> If `tests/test_models.py` lacks a `db_session` fixture import path, the project `conftest.py` already provides `db_session`; reference it the same way other tests in this file do.

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_models.py -q`
Expected: FAIL — `TypeError: 'beat_times' is an invalid keyword argument` (or similar).

- [ ] **Step 3: Update the models**

In `app/models.py`, add `JSON` and `Integer` to the SQLAlchemy import:

```python
from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
```

Add to `Analysis`:

```python
    beat_times: Mapped[list[float]] = mapped_column(JSON, default=list, nullable=False)
```

Replace the `ChordChart` body's columns with (keep the relationships, update `order_by`):

```python
    key_tonic: Mapped[str] = mapped_column(String, nullable=False)
    key_mode: Mapped[str] = mapped_column(String, nullable=False)
    beats_per_measure: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    measure_offset: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    beat_times: Mapped[list[float]] = mapped_column(JSON, default=list, nullable=False)

    recording: Mapped[Recording] = relationship(back_populates="chart")
    segments: Mapped[list["ChordSegment"]] = relationship(
        back_populates="chart",
        cascade="all, delete-orphan",
        order_by="ChordSegment.start_beat",
    )
```

Replace `ChordSegment`'s `start_time`/`end_time` columns:

```python
    start_beat: Mapped[float] = mapped_column(Float, nullable=False)
    end_beat: Mapped[float] = mapped_column(Float, nullable=False)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_models.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat(models): beat-native columns on chart/segment/analysis"
```

---

## Task 4: Seed charts in beats

**Files:**
- Modify: `app/jobs.py`
- Test: `tests/test_jobs.py`

**Interfaces:**
- Consumes: `AnalysisResult.beat_times` (Task 2); `app.audio.beatgrid` (Task 1); beat columns (Task 3).
- Produces: `_seed_chart` writes `chart.beat_times`, `chart.beats_per_measure`/`measure_offset` defaults, and per-segment `start_beat`/`end_beat` (contiguous, ≥ 0.5 beats, anchored at 0).

- [ ] **Step 1: Write the failing test**

```python
# add to tests/test_jobs.py
def test_seed_chart_assigns_whole_beats(db_session):
    from app.audio.analyzer import AnalysisResult
    from app.audio.segments import DetectedSegment
    from app.jobs import _seed_chart
    from app.models import Recording, User
    from app.music_theory import Quality

    user = User(username="seed", password_hash="x")
    db_session.add(user)
    db_session.flush()
    rec = Recording(user_id=user.id, original_filename="m.m4a", format="m4a",
                    stored_path="/tmp/m.m4a", duration_seconds=8.0)
    db_session.add(rec)
    db_session.flush()

    # Steady 120 BPM -> 0.5s/beat. Two chords, each 4 beats (2.0s).
    grid = [round(i * 0.5, 3) for i in range(17)]  # beats 0..16 over 8s
    result = AnalysisResult(
        bpm=120.0, key_tonic_pc=0, key_mode="major", duration=8.0,
        segments=[
            DetectedSegment(0.0, 2.0, 0, Quality.MAJ),
            DetectedSegment(2.0, 4.0, 7, Quality.MAJ),
        ],
        beat_times=grid,
    )
    _seed_chart(db_session, rec, result)
    db_session.commit()

    segs = sorted(rec.chart.segments, key=lambda s: s.start_beat)
    assert rec.chart.beat_times == grid
    assert rec.chart.beats_per_measure == 4
    assert (segs[0].start_beat, segs[0].end_beat) == (0.0, 4.0)
    assert (segs[1].start_beat, segs[1].end_beat) == (4.0, 8.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_jobs.py::test_seed_chart_assigns_whole_beats -q`
Expected: FAIL — `_seed_chart` still writes `start_time`/`end_time` (TypeError on the removed columns or AssertionError on missing beats).

- [ ] **Step 3: Rewrite `_seed_chart`**

In `app/jobs.py`, add the import:

```python
from app.audio.beatgrid import beat_for_time, ensure_grid, snap_half, total_beats
```

Replace `_seed_chart` with:

```python
def _seed_chart(db: Session, recording: Recording, result: AnalysisResult) -> None:
    existing = db.execute(
        select(ChordChart).where(ChordChart.recording_id == recording.id)
    ).scalar_one_or_none()
    if existing is not None:
        db.delete(existing)
        db.flush()

    # #1: trust the server-decoded length over the browser-reported duration.
    duration = result.duration
    recording.duration_seconds = duration

    grid = ensure_grid(result.beat_times, result.bpm, duration)
    max_beat = total_beats(grid, duration)

    tonic = tonic_for_pitch_class(result.key_tonic_pc, result.key_mode)
    prefer_flats = key_prefers_flats(tonic, result.key_mode)
    chart = ChordChart(
        recording_id=recording.id,
        key_tonic=tonic,
        key_mode=result.key_mode,
        beat_times=grid,
    )
    db.add(chart)
    db.flush()

    cursor = 0.0  # beats; chords are laid out contiguously from beat 0
    for segment in result.segments:
        end_beat = snap_half(beat_for_time(min(segment.end_time, duration), grid))
        end_beat = min(end_beat, max_beat)
        if end_beat - cursor < 0.5:  # too short after snapping; skip
            continue
        db.add(
            ChordSegment(
                chart_id=chart.id,
                start_beat=cursor,
                end_beat=end_beat,
                chord_root=pitch_class_to_note(segment.root_pc, prefer_flats=prefer_flats),
                chord_quality=segment.quality.value,
            )
        )
        cursor = end_beat
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_jobs.py -q`
Expected: PASS (existing job tests still green).

- [ ] **Step 5: Commit**

```bash
git add app/jobs.py tests/test_jobs.py
git commit -m "feat(jobs): seed chord charts in beats from the detected grid"
```

---

## Task 5: Beat-native API (schemas)

**Files:**
- Modify: `app/schemas.py`
- Test: `tests/test_models.py` (schema-shape unit checks) — or a new `tests/test_schemas.py` if the file does not exist.

**Interfaces:**
- Produces:
  - `SegmentOut` += `start_beat: float`, `end_beat: float`; keeps computed `start_time`/`end_time`.
  - `SegmentCreate` = `{start_beat, end_beat, chord_root, chord_quality}`; `SegmentUpdate` = optional `{start_beat, end_beat, chord_root, chord_quality}`. `start_beat`/`end_beat` validated `>= 0`.
  - `ChartOut` += `beats_per_measure: int`, `measure_offset: int`, `beat_times: list[float]`.
  - `AnalysisOut` += `beat_times: list[float]`.
  - New `ChartSettingsUpdate = {beats_per_measure: int >= 1 (optional), measure_offset: int >= 0 (optional)}`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_schemas.py  (create)
import pytest
from pydantic import ValidationError

from app.schemas import ChartSettingsUpdate, SegmentCreate, SegmentOut


def test_segment_create_uses_beats():
    s = SegmentCreate(start_beat=0.0, end_beat=4.0, chord_root="C", chord_quality="maj")
    assert s.start_beat == 0.0 and s.end_beat == 4.0


def test_segment_create_rejects_negative_beat():
    with pytest.raises(ValidationError):
        SegmentCreate(start_beat=-1.0, end_beat=4.0, chord_root="C", chord_quality="maj")


def test_segment_out_carries_beats_and_seconds():
    out = SegmentOut(id="x", start_beat=0.0, end_beat=4.0, start_time=0.0, end_time=2.0,
                     chord_root="C", chord_quality="maj", roman_numeral="I")
    assert out.start_beat == 0.0 and out.end_time == 2.0


def test_chart_settings_update_validates_measure():
    with pytest.raises(ValidationError):
        ChartSettingsUpdate(beats_per_measure=0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_schemas.py -q`
Expected: FAIL — `ImportError` for `ChartSettingsUpdate`, and `SegmentCreate` still has `start_time`.

- [ ] **Step 3: Update `app/schemas.py`**

Replace `SegmentCreate`, `SegmentUpdate`, `SegmentOut`, `ChartOut`, `AnalysisOut`, and add `ChartSettingsUpdate`:

```python
class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    bpm: float | None
    detected_key_tonic: str | None
    detected_key_mode: str | None
    engine_version: str | None
    error: str | None
    beat_times: list[float] = Field(default_factory=list)


class SegmentCreate(BaseModel):
    start_beat: float = Field(ge=0)
    end_beat: float = Field(gt=0)
    chord_root: str = Field(pattern="^[A-G][b#]?$")
    chord_quality: str = Field(pattern="^(maj|min|dom7|maj7|min7)$")


class SegmentUpdate(BaseModel):
    start_beat: float | None = Field(default=None, ge=0)
    end_beat: float | None = Field(default=None, gt=0)
    chord_root: str | None = Field(default=None, pattern="^[A-G][b#]?$")
    chord_quality: str | None = Field(default=None, pattern="^(maj|min|dom7|maj7|min7)$")


class SegmentOut(BaseModel):
    id: str
    start_beat: float
    end_beat: float
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
    beats_per_measure: int
    measure_offset: int
    beat_times: list[float]
    segments: list[SegmentOut]


class ChartSettingsUpdate(BaseModel):
    beats_per_measure: int | None = Field(default=None, ge=1, le=16)
    measure_offset: int | None = Field(default=None, ge=0)
```

Leave `AnalysisOut`'s `from_attributes` working — `Analysis.beat_times` (Task 3) provides the value.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_schemas.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/schemas.py tests/test_schemas.py
git commit -m "feat(schemas): beat-based segment/chart shapes + chart settings"
```

---

## Task 6: Beat-native chart router

**Files:**
- Modify: `app/routers/charts.py`
- Test: `tests/test_charts.py`

**Interfaces:**
- Consumes: `beatgrid` (Task 1), beat schemas (Task 5), beat columns (Task 3).
- Produces:
  - `_segment_out` derives `start_time`/`end_time` from the chart grid.
  - `_chart_out` includes `beats_per_measure`, `measure_offset`, `beat_times`.
  - segment create/update/reorder operate in beats; window validation checks `end_beat <= total_beats(grid, duration)`.
  - new `PATCH /api/charts/{chart_id}/settings` → `ChartOut`.

- [ ] **Step 1: Write the failing tests**

First update the existing helpers/tests in `tests/test_charts.py` that POST seconds. Change `_make_chart` is fine (chart create takes key only). Update the segment-posting tests to beats and add new ones:

```python
# replace the seconds-based segment tests in tests/test_charts.py with beat-based ones

def test_add_segment_computes_roman_and_seconds(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # duration=10.0
    resp = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "G", "chord_quality": "dom7"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["roman_numeral"] == "V7"
    # No analysis -> synthesized 120 BPM grid (0.5s/beat): 4 beats == 2.0s.
    assert body["start_time"] == pytest.approx(0.0)
    assert body["end_time"] == pytest.approx(2.0)


def test_add_overlapping_segment_rejected(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    client.post(f"/api/charts/{chart_id}/segments",
                json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "C", "chord_quality": "maj"})
    resp = client.post(f"/api/charts/{chart_id}/segments",
                       json={"start_beat": 2.0, "end_beat": 6.0, "chord_root": "F", "chord_quality": "maj"})
    assert resp.status_code == 422


def test_segment_beyond_grid_rejected(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # duration 10s -> 20 beats
    resp = client.post(f"/api/charts/{chart_id}/segments",
                       json={"start_beat": 0.0, "end_beat": 999.0, "chord_root": "C", "chord_quality": "maj"})
    assert resp.status_code == 422


def test_update_chart_settings(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    resp = client.patch(f"/api/charts/{chart_id}/settings",
                        json={"beats_per_measure": 3, "measure_offset": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["beats_per_measure"] == 3
    assert body["measure_offset"] == 1
```

Add `import pytest` at the top of `tests/test_charts.py` if absent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_charts.py -q`
Expected: FAIL — router still reads `start_time`, no `/settings` route.

- [ ] **Step 3: Update `app/routers/charts.py`**

Update imports:

```python
from app.audio.beatgrid import ensure_grid, time_for_beat, total_beats
from app.schemas import (
    ChartCreate,
    ChartOut,
    ChartSettingsUpdate,
    SegmentCreate,
    SegmentOut,
    SegmentReorder,
    SegmentUpdate,
    TransposeRequest,
)
```

Add a grid helper and rewrite the serializers:

```python
def _chart_grid(chart: ChordChart) -> tuple[list[float], float]:
    duration = chart.recording.duration_seconds or 0.0
    bpm = chart.recording.analysis.bpm if chart.recording.analysis else None
    grid = ensure_grid(list(chart.beat_times or []), bpm, duration)
    return grid, duration


def _segment_out(seg: ChordSegment, chart: ChordChart, grid: list[float], duration: float) -> SegmentOut:
    return SegmentOut(
        id=seg.id,
        start_beat=seg.start_beat,
        end_beat=seg.end_beat,
        start_time=time_for_beat(seg.start_beat, grid, duration),
        end_time=time_for_beat(seg.end_beat, grid, duration),
        chord_root=seg.chord_root,
        chord_quality=seg.chord_quality,
        roman_numeral=roman_numeral(
            seg.chord_root, Quality(seg.chord_quality), chart.key_tonic, chart.key_mode
        ),
    )


def _chart_out(chart: ChordChart) -> ChartOut:
    grid, duration = _chart_grid(chart)
    return ChartOut(
        id=chart.id,
        recording_id=chart.recording_id,
        key_tonic=chart.key_tonic,
        key_mode=chart.key_mode,
        beats_per_measure=chart.beats_per_measure,
        measure_offset=chart.measure_offset,
        beat_times=list(chart.beat_times or []),
        segments=[_segment_out(s, chart, grid, duration) for s in chart.segments],
    )
```

Rewrite `_validate_segment_window` to work in beats:

```python
def _validate_segment_window(
    chart: ChordChart, start: float, end: float, exclude_id: str | None
) -> None:
    if start >= end:
        raise HTTPException(status_code=422, detail="start_beat must be before end_beat")
    grid, duration = _chart_grid(chart)
    if end > total_beats(grid, duration) + 1e-6:
        raise HTTPException(status_code=422, detail="end_beat exceeds the chart's beat grid")
    for other in chart.segments:
        if other.id == exclude_id:
            continue
        if start < other.end_beat and end > other.start_beat:
            raise HTTPException(status_code=422, detail="segment overlaps an existing segment")
```

Update `add_segment`:

```python
    chart = _owned_chart(db, user, chart_id)
    _validate_segment_window(chart, payload.start_beat, payload.end_beat, None)
    seg = ChordSegment(
        chart_id=chart.id,
        start_beat=payload.start_beat,
        end_beat=payload.end_beat,
        chord_root=payload.chord_root,
        chord_quality=payload.chord_quality,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    grid, duration = _chart_grid(chart)
    return _segment_out(seg, chart, grid, duration)
```

Update `update_segment`:

```python
    new_start = payload.start_beat if payload.start_beat is not None else seg.start_beat
    new_end = payload.end_beat if payload.end_beat is not None else seg.end_beat
    _validate_segment_window(chart, new_start, new_end, exclude_id=seg.id)
    seg.start_beat = new_start
    seg.end_beat = new_end
    if payload.chord_root is not None:
        seg.chord_root = payload.chord_root
    if payload.chord_quality is not None:
        seg.chord_quality = payload.chord_quality
    db.commit()
    db.refresh(seg)
    grid, duration = _chart_grid(chart)
    return _segment_out(seg, chart, grid, duration)
```

Update `reorder_segments` to work in beats:

```python
    cursor = min((s.start_beat for s in chart.segments), default=0.0)
    grid, duration = _chart_grid(chart)
    for seg_id in payload.segment_ids:
        seg = by_id[seg_id]
        length = seg.end_beat - seg.start_beat
        seg.start_beat = cursor
        seg.end_beat = cursor + length
        cursor = seg.end_beat
    if cursor > total_beats(grid, duration) + 1e-6:
        raise HTTPException(status_code=422, detail="reordered segments exceed the beat grid")
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)
```

Add the settings route (place near the other chart routes):

```python
@router.patch("/charts/{chart_id}/settings", response_model=ChartOut)
def update_chart_settings(
    chart_id: str,
    payload: ChartSettingsUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    chart = _owned_chart(db, user, chart_id)
    if payload.beats_per_measure is not None:
        chart.beats_per_measure = payload.beats_per_measure
    if payload.measure_offset is not None:
        chart.measure_offset = payload.measure_offset
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_charts.py -q`
Expected: PASS. Then run the full backend suite: `.venv/bin/pytest -q` and fix any seconds-based assertions left in `tests/test_charts.py`/`tests/test_recordings.py` by converting them to beats.

- [ ] **Step 5: Commit**

```bash
git add app/routers/charts.py tests/test_charts.py
git commit -m "feat(charts): beat-native segments, derived seconds, chart settings"
```

---

## Task 7: Migration script for existing databases

**Files:**
- Create: `scripts/migrate_beats.py`
- Test: manual (documented run).

**Interfaces:**
- Produces: an idempotent script that `ALTER TABLE ... ADD COLUMN` for the new beat columns on an existing SQLite DB so the app boots; existing charts are repopulated on next analysis.

- [ ] **Step 1: Write the script**

```python
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
```

- [ ] **Step 2: Run it against a copy to verify it succeeds**

Run:
```bash
cp tabit.db /tmp/tabit-migrate-test.db && .venv/bin/python scripts/migrate_beats.py /tmp/tabit-migrate-test.db
```
Expected: prints `added ...` lines on first run, `done` at the end; a second run prints only `done` (idempotent).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate_beats.py
git commit -m "chore(db): additive beat-column migration script for existing DBs"
```

---

## Task 8: Frontend types + client wiring

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/chart/useChart.ts`
- Test: none (type-only; covered by later component tests + `tsc`).

**Interfaces:**
- Produces:
  - `AnalysisOut` += `beat_times: number[]`.
  - `SegmentOut` += `start_beat`, `end_beat` (keeps `start_time`/`end_time`).
  - `ChartOut` += `beats_per_measure`, `measure_offset`, `beat_times`.
  - `SegmentInput`/`SegmentPatch` in beats; `useChart` exposes `updateSettings(patch)`.

- [ ] **Step 1: Update `types.ts`**

```typescript
export interface AnalysisOut {
  status: "pending" | "running" | "done" | "failed";
  bpm: number | null;
  detected_key_tonic: string | null;
  detected_key_mode: string | null;
  engine_version: string | null;
  error: string | null;
  beat_times: number[];
}

export interface SegmentOut {
  id: string;
  start_beat: number;
  end_beat: number;
  start_time: number;
  end_time: number;
  chord_root: string;
  chord_quality: string;
  roman_numeral: string;
}

export interface ChartOut {
  id: string;
  recording_id: string;
  key_tonic: string;
  key_mode: string;
  beats_per_measure: number;
  measure_offset: number;
  beat_times: number[];
  segments: SegmentOut[];
}
```

- [ ] **Step 2: Update `useChart.ts`**

Change `SegmentInput` to beats and add a settings mutation:

```typescript
export interface SegmentInput {
  start_beat: number;
  end_beat: number;
  chord_root: string;
  chord_quality: string;
}
export type SegmentPatch = Partial<SegmentInput>;
export interface ChartSettingsPatch {
  beats_per_measure?: number;
  measure_offset?: number;
}
```

Add the mutation inside `useChart` (next to `transposeMut`):

```typescript
  const settingsMut = useMutation({
    mutationFn: (patch: ChartSettingsPatch) =>
      api.patchJson<ChartOut>(`/api/charts/${chartId}/settings`, patch),
    onSuccess: invalidate,
  });
```

Include it in `isMutating` (`|| settingsMut.isPending`) and the returned object:

```typescript
    updateSettings: (patch: ChartSettingsPatch) => settingsMut.mutateAsync(patch),
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors only in files updated in later tasks (Timeline/SegmentEditor/ChartEditorPage). Note them; they are fixed in Tasks 9–11.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/chart/useChart.ts
git commit -m "feat(frontend): beat-based chart/segment types + settings mutation"
```

---

## Task 9: `beatMath` + measure-aware layout

**Files:**
- Create: `frontend/src/chart/beatMath.ts`
- Modify: `frontend/src/chart/chartLayout.ts`
- Test: `frontend/src/chart/beatMath.test.ts`, `frontend/src/chart/chartLayout.test.ts`

**Interfaces:**
- Produces:
  - `snapHalfBeat(beat: number): number`
  - `clampBeatBoundary(beat: number, lower: number, upper: number, min?: number): number` (min default 0.5, result snapped to 0.5)
  - `beatSlashMarks(beats: number): string` — e.g. `4 -> "╱ ╱ ╱"`, `2.5 -> "╱ ·"`.
  - `chartLayout`: `measuresPerLine: number` constant (4); `groupIntoLines(segments, beatsPerLine)` becomes beat-aware; `boundaryUpdates` switches to beat patches (`{start_beat?, end_beat?}`).

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/chart/beatMath.test.ts
import { describe, expect, it } from "vitest";
import { beatSlashMarks, clampBeatBoundary, snapHalfBeat } from "./beatMath";

describe("beatMath", () => {
  it("snaps to the nearest half beat", () => {
    expect(snapHalfBeat(1.24)).toBe(1);
    expect(snapHalfBeat(1.26)).toBe(1.5);
  });
  it("clamps inside neighbours and snaps", () => {
    expect(clampBeatBoundary(0.1, 0, 4)).toBe(0.5);
    expect(clampBeatBoundary(3.9, 0, 4)).toBe(3.5);
    expect(clampBeatBoundary(2.24, 0, 4)).toBe(2);
  });
  it("renders one slash per beat after the first, half-beat as a tick", () => {
    expect(beatSlashMarks(4)).toBe("╱ ╱ ╱");
    expect(beatSlashMarks(1)).toBe("");
    expect(beatSlashMarks(2.5)).toBe("╱ ·");
  });
});
```

```typescript
// add to frontend/src/chart/chartLayout.test.ts
import { groupIntoLines } from "./chartLayout";

it("wraps segments into whole-measure lines by beat count", () => {
  const seg = (b: number) => ({ start_beat: 0, end_beat: b });
  // beatsPerLine = 8 (e.g. 2 measures of 4). Three 4-beat chords -> [2,1].
  const lines = groupIntoLines([seg(4), seg(4), seg(4)], 8);
  expect(lines.map((l) => l.length)).toEqual([2, 1]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run beatMath chartLayout`
Expected: FAIL — `beatMath` missing; `groupIntoLines` signature mismatch.

- [ ] **Step 3: Create `beatMath.ts`**

```typescript
// frontend/src/chart/beatMath.ts
export function snapHalfBeat(beat: number): number {
  return Math.round(beat * 2) / 2;
}

export function clampBeatBoundary(
  beat: number,
  lower: number,
  upper: number,
  min = 0.5,
): number {
  const clamped = Math.max(lower + min, Math.min(upper - min, beat));
  return snapHalfBeat(clamped);
}

// "C ╱ ╱ ╱" rhythm: one slash per whole beat after the first; a trailing half-beat
// renders as a short tick. Returns just the marks (no chord name).
export function beatSlashMarks(beats: number): string {
  const whole = Math.floor(beats);
  const half = beats - whole >= 0.5;
  const marks: string[] = [];
  for (let i = 1; i < whole; i += 1) marks.push("╱");
  if (half) marks.push("·");
  return marks.join(" ");
}
```

- [ ] **Step 4: Update `chartLayout.ts`**

Replace `chordsPerLine` with a measure constant and make `groupIntoLines` beat-aware; switch `SegmentUpdate`/`boundaryUpdates` to beats:

```typescript
// how many measures fit on one line of the lead sheet.
export const MEASURES_PER_LINE = 4;

interface BeatSpan { start_beat: number; end_beat: number; }

// Greedily fill each line until adding the next chord would exceed `beatsPerLine`,
// so bar lines stay regular. A chord longer than a line gets its own line.
export function groupIntoLines<T extends BeatSpan>(items: T[], beatsPerLine: number): T[][] {
  const cap = Math.max(1, beatsPerLine);
  const lines: T[][] = [];
  let line: T[] = [];
  let acc = 0;
  for (const item of items) {
    const len = Math.max(0.5, item.end_beat - item.start_beat);
    if (line.length > 0 && acc + len > cap + 1e-6) {
      lines.push(line);
      line = [];
      acc = 0;
    }
    line.push(item);
    acc += len;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export interface SegmentUpdate {
  id: string;
  patch: { start_beat?: number; end_beat?: number };
}

export function boundaryUpdates(
  left: { id: string } | undefined,
  right: { id: string } | undefined,
  oldBoundary: number,
  newBoundary: number,
): SegmentUpdate[] {
  if (newBoundary === oldBoundary) return [];
  const updates: SegmentUpdate[] = [];
  if (left) updates.push({ id: left.id, patch: { end_beat: newBoundary } });
  if (right) updates.push({ id: right.id, patch: { start_beat: newBoundary } });
  if (newBoundary > oldBoundary) updates.reverse();
  return updates;
}
```

Keep `reorderIds` unchanged. Remove the now-unused `chordsPerLine` export and its test (delete the `chordsPerLine` test case in `chartLayout.test.ts`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test -- --run beatMath chartLayout`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/chart/beatMath.ts frontend/src/chart/beatMath.test.ts frontend/src/chart/chartLayout.ts frontend/src/chart/chartLayout.test.ts
git commit -m "feat(frontend): beat math + measure-aware line wrapping"
```

---

## Task 10: Timeline — beat sizing, slashes, bar lines, beat-snapped resize

**Files:**
- Modify: `frontend/src/chart/Timeline.tsx`
- Test: `frontend/src/chart/Timeline.test.tsx`

**Interfaces:**
- Consumes: `beatMath` (Task 9), beat-based `chartLayout` (Task 9), `ChartOut`/`SegmentOut` (Task 8).
- Produces: `Timeline` props gain `beatsPerMeasure: number` and `measureOffset: number`; cells sized by beat count; slash marks rendered; a left bar-line on measure-starting cells; resize commits beat patches.

- [ ] **Step 1: Write the failing test**

```typescript
// add to frontend/src/chart/Timeline.test.tsx — follow the file's existing render helper/imports
import { beatSlashMarks } from "./beatMath";

it("renders slash marks for a 4-beat chord", () => {
  const segments = [{
    id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2,
    chord_root: "C", chord_quality: "maj", roman_numeral: "I",
  }];
  // Render Timeline with the new props (mirror the existing test's render call).
  renderTimeline({ segments, beatsPerMeasure: 4, measureOffset: 0 });
  expect(screen.getByText(beatSlashMarks(4))).toBeInTheDocument(); // "╱ ╱ ╱"
});
```

> Match the existing `Timeline.test.tsx` rendering helper and required props (`bpm`, `duration`, `currentTime`, `selectedId`, `onSelect`). Add `beatsPerMeasure`/`measureOffset` to whatever props object that test builds.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run Timeline`
Expected: FAIL — slash marks not rendered / unknown props.

- [ ] **Step 3: Update `Timeline.tsx`**

Key changes (full reasoning inline):

```typescript
import { useRef, useState } from "react";
import type { SegmentOut } from "../api/types";
import {
  boundaryUpdates,
  groupIntoLines,
  MEASURES_PER_LINE,
  reorderIds,
  type SegmentUpdate,
} from "./chartLayout";
import { beatSlashMarks, clampBeatBoundary } from "./beatMath";

export type { SegmentUpdate };

interface Props {
  segments: SegmentOut[];
  beatsPerMeasure: number;
  measureOffset: number;
  duration: number;
  currentTime: number;
  selectedId: string | null;
  onSelect: (segmentId: string) => void;
  onSeek?: (time: number) => void;
  onResizeCommit?: (updates: SegmentUpdate[]) => void;
  onReorder?: (orderedIds: string[]) => void;
}

// Horizontal pointer movement -> beats for the resize handles.
const BEATS_PER_PIXEL = 0.05;
```

Inside the component, replace the layout setup:

```typescript
  const ordered = [...segments].sort((a, b) => a.start_beat - b.start_beat);
  const orderedIds = ordered.map((s) => s.id);
  const indexById = new Map(orderedIds.map((id, i) => [id, i] as const));
  const beatsPerLine = Math.max(1, beatsPerMeasure) * MEASURES_PER_LINE;
  const lines = groupIntoLines(ordered, beatsPerLine);
```

Rewrite `startResize` to operate in beats:

```typescript
  function startResize(index: number, edge: "left" | "right", e: React.PointerEvent) {
    e.stopPropagation();
    suppressClick.current = false;
    if (!onResizeCommit) return;
    const seg = ordered[index];
    const left = edge === "left" ? ordered[index - 1] : seg;
    const right = edge === "left" ? seg : ordered[index + 1];
    const oldBoundary = edge === "left" ? seg.start_beat : seg.end_beat;
    const lower = left ? left.start_beat : 0;
    const upper = right ? right.end_beat : oldBoundary + beatsPerMeasure;
    const startX = e.clientX;

    const move = (ev: PointerEvent) => ev.preventDefault();
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      suppressClick.current = true;
      const db = (ev.clientX - startX) * BEATS_PER_PIXEL;
      const boundary = clampBeatBoundary(oldBoundary + db, lower, upper);
      const updates = boundaryUpdates(left, right, oldBoundary, boundary);
      if (updates.length) onResizeCommit(updates);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
```

In the cell render, compute beat span, playing state from seconds (unchanged), and a measure-boundary flag; size by beats and add a bar-line border + slash marks:

```typescript
            const beats = Math.max(0.5, s.end_beat - s.start_beat);
            const playing = currentTime >= s.start_time && currentTime < s.end_time;
            const span = Math.max(0.01, s.end_time - s.start_time);
            const progress = playing
              ? Math.min(1, Math.max(0, (currentTime - s.start_time) / span))
              : 0;
            const onMeasure =
              Math.abs(((s.start_beat - measureOffset) % beatsPerMeasure)) < 1e-6;
```

Update the cell `style` `flex` and left border:

```typescript
                style={{
                  position: "relative",
                  flex: `${beats} 1 0`,
                  minWidth: 56,
                  height: 64,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  overflow: "hidden",
                  border: selected ? "2px solid var(--accent)" : "1px solid #2c313a",
                  borderLeft: onMeasure ? "3px solid var(--accent)" : "1px solid #2c313a",
                  background: playing ? "#26303f" : "var(--panel)",
                }}
```

Replace the roman-numeral line area to show chord name + slash marks (keep `roman_numeral` too):

```typescript
                <strong>{chordLabel(s)}</strong>
                <span className="muted slash-marks">{beatSlashMarks(beats)}</span>
                <span className="muted">{s.roman_numeral}</span>
```

Leave the resize handles, drop indicators, and progress bar as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --run Timeline`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart/Timeline.tsx frontend/src/chart/Timeline.test.tsx
git commit -m "feat(timeline): size cells by beats, draw slashes + bar lines, snap resize"
```

---

## Task 11: SegmentEditor beat stepper, time-signature control, page wiring

**Files:**
- Modify: `frontend/src/chart/SegmentEditor.tsx`
- Create: `frontend/src/chart/TimeSignatureControl.tsx`
- Modify: `frontend/src/pages/ChartEditorPage.tsx`
- Test: `frontend/src/chart/SegmentEditor.test.tsx`

**Interfaces:**
- Consumes: beat schemas/types (Task 8), `useChart.updateSettings` (Task 8), beat-based `Timeline` props (Task 10).
- Produces: `SegmentEditor` edits beat length; `TimeSignatureControl` edits `beats_per_measure`/`measure_offset`; `ChartEditorPage` wires all beat props and a beat-based "Add segment".

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/chart/SegmentEditor.test.tsx — adapt to the file's existing render setup
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SegmentEditor from "./SegmentEditor";

const seg = {
  id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2,
  chord_root: "C", chord_quality: "maj", roman_numeral: "I",
};

describe("SegmentEditor beats", () => {
  it("saves a new beat length as end_beat = start_beat + count", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SegmentEditor segment={seg} onSave={onSave} onDelete={() => {}} busy={false} />);
    const beats = screen.getByLabelText(/beats/i) as HTMLInputElement;
    fireEvent.change(beats, { target: { value: "2" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ end_beat: 2 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run SegmentEditor`
Expected: FAIL — no "Beats" field; still posts `start_time`/`end_time`.

- [ ] **Step 3: Rewrite `SegmentEditor.tsx`**

```typescript
import { useEffect, useState } from "react";
import type { SegmentOut } from "../api/types";
import type { SegmentPatch } from "./useChart";
import { ROOTS, QUALITIES, QUALITY_LABELS } from "../api/music";
import { snapHalfBeat } from "./beatMath";

interface Props {
  segment: SegmentOut;
  onSave: (patch: SegmentPatch) => Promise<void>;
  onDelete: () => void;
  busy: boolean;
}

export default function SegmentEditor({ segment, onSave, onDelete, busy }: Props) {
  const [root, setRoot] = useState(segment.chord_root);
  const [quality, setQuality] = useState(segment.chord_quality);
  const [beats, setBeats] = useState(segment.end_beat - segment.start_beat);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoot(segment.chord_root);
    setQuality(segment.chord_quality);
    setBeats(segment.end_beat - segment.start_beat);
    setError(null);
  }, [segment.id, segment.chord_root, segment.chord_quality, segment.start_beat, segment.end_beat]);

  async function save() {
    setError(null);
    try {
      const length = Math.max(0.5, snapHalfBeat(beats));
      await onSave({
        chord_root: root,
        chord_quality: quality,
        end_beat: snapHalfBeat(segment.start_beat + length),
      });
    } catch (err) {
      const detail = (err as { detail?: string }).detail;
      setError(detail ?? "Could not save segment");
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <strong>Edit segment</strong>
      <label>
        Root
        <select value={root} onChange={(e) => setRoot(e.target.value)}>
          {ROOTS.map((r) => (<option key={r} value={r}>{r}</option>))}
        </select>
      </label>
      <label>
        Quality
        <select value={quality} onChange={(e) => setQuality(e.target.value)}>
          {QUALITIES.map((q) => (<option key={q} value={q}>{QUALITY_LABELS[q]}</option>))}
        </select>
      </label>
      <label>
        Beats
        <input
          type="number"
          step="0.5"
          min="0.5"
          value={beats}
          onChange={(e) => setBeats(Number(e.target.value))}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" onClick={save} disabled={busy}>Save</button>
        <button className="danger" onClick={onDelete} disabled={busy}>Delete</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `TimeSignatureControl.tsx`**

```typescript
// frontend/src/chart/TimeSignatureControl.tsx
import type { ChartSettingsPatch } from "./useChart";

interface Props {
  beatsPerMeasure: number;
  measureOffset: number;
  onChange: (patch: ChartSettingsPatch) => void;
  busy: boolean;
}

export default function TimeSignatureControl({
  beatsPerMeasure,
  measureOffset,
  onChange,
  busy,
}: Props) {
  return (
    <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span>Beats / measure: <strong>{beatsPerMeasure}</strong></span>
      <button disabled={busy || beatsPerMeasure <= 1}
              onClick={() => onChange({ beats_per_measure: beatsPerMeasure - 1 })}>−</button>
      <button disabled={busy || beatsPerMeasure >= 16}
              onClick={() => onChange({ beats_per_measure: beatsPerMeasure + 1 })}>+</button>
      <span style={{ marginLeft: 12 }}>Bar-line shift: <strong>{measureOffset}</strong></span>
      <button disabled={busy || measureOffset <= 0}
              onClick={() => onChange({ measure_offset: measureOffset - 1 })}>◀</button>
      <button disabled={busy || measureOffset >= beatsPerMeasure - 1}
              onClick={() => onChange({ measure_offset: measureOffset + 1 })}>▶</button>
    </div>
  );
}
```

- [ ] **Step 5: Wire `ChartEditorPage.tsx`**

Add imports:

```typescript
import TimeSignatureControl from "../chart/TimeSignatureControl";
```

Pull `updateSettings` from `useChart`:

```typescript
  const {
    chart, isLoading: chartLoading, isMutating,
    addSegment, updateSegment, deleteSegment, transpose, reorder, updateSettings,
  } = useChart(id);
```

Update the `<Timeline>` props (drop `bpm`, add beat props):

```tsx
            <Timeline
              segments={chart.segments}
              beatsPerMeasure={chart.beats_per_measure}
              measureOffset={chart.measure_offset}
              duration={duration}
              currentTime={currentTime}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSeek={seek}
              onResizeCommit={applyResize}
              onReorder={reorderSegments}
            />
```

Add the control beneath `TransposeControl`:

```tsx
            <TimeSignatureControl
              beatsPerMeasure={chart.beats_per_measure}
              measureOffset={chart.measure_offset}
              onChange={(patch) => updateSettings(patch)}
              busy={isMutating}
            />
```

Replace the "Add segment" click handler with beat-based defaults (append one measure):

```tsx
              onClick={() => {
                const lastEnd = chart.segments[chart.segments.length - 1]?.end_beat ?? 0;
                addSegment({
                  start_beat: lastEnd,
                  end_beat: lastEnd + chart.beats_per_measure,
                  chord_root: chart.key_tonic,
                  chord_quality: "maj",
                });
              }}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd frontend && npm test -- --run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/chart/SegmentEditor.tsx frontend/src/chart/SegmentEditor.test.tsx frontend/src/chart/TimeSignatureControl.tsx frontend/src/pages/ChartEditorPage.tsx
git commit -m "feat(frontend): beat-count editor, time-signature control, page wiring"
```

---

## Task 12: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Backend suite**

Run: `.venv/bin/pytest -q`
Expected: all pass. If any seconds-based assertions remain in `tests/test_recordings.py` or elsewhere (e.g. asserting `segment["start_time"]` after seeding), convert them to assert on `start_beat`/`end_beat` or the derived seconds, matching the new contract.

- [ ] **Step 2: Frontend suite + typecheck + build**

Run: `cd frontend && npm test -- --run && npx tsc --noEmit && npm run build`
Expected: tests pass, no type errors, build succeeds.

- [ ] **Step 3: End-to-end smoke (the test fixture)**

Reset/migrate the dev DB, start the API, upload `audio/Simple I V IV I.m4a`, and confirm the seeded chart shows four-beat chords with bar lines per measure. (Use the project's run instructions in `README.md`.)

- [ ] **Step 4: Commit any test fixups**

```bash
git add -A
git commit -m "test: align remaining suites with beat-native chart contract"
```

---

## Self-Review notes

- **Spec coverage:** §1 source-of-truth → Tasks 3–6; §2 model → Task 3; beatgrid mapping → Task 1; §3 seeding → Task 4; §4 API → Tasks 5–6; §5 frontend (sizing, slashes, bar lines, measure wrapping, snap resize, beat stepper, time-sig + phase controls, types) → Tasks 8–11; §6 migration → Task 7; §7 testing → embedded per task + Task 12.
- **Empty/manual charts** (created via `POST /recordings/{id}/chart` with no analysis) have no detected grid; `ensure_grid` synthesizes a 120-BPM grid (or the analysis BPM when present) so beats↔seconds still resolve. Covered by Task 6's `test_add_segment_computes_roman_and_seconds`.
- **Type consistency:** `start_beat`/`end_beat` used uniformly across schemas, models, router, types, and components; `beats_per_measure`/`measure_offset` names match across backend and frontend; `groupIntoLines` is beat-aware in both `Timeline` and its test.

# Beat-native chord chart — design

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending implementation plan

## Problem

Today a chord's length is conveyed only by the **width of its cell**, which is
proportional to its duration in **seconds**. Musicians read music in **beats per
measure** (e.g. 4/4 → four beats per bar): chords change on or between beats, and a
chord held for a full bar is held for all four beats. Showing beats — and chord changes
relative to a beat — is a more universally understood way to read a chart.

In the project's test audio (`audio/Simple I V IV I.m4a`) each chord is played for
exactly 4 beats at a steady tempo, so it is the canonical correctness fixture.

## Decision summary

| Question | Decision |
| --- | --- |
| How deep is the beat model? | **Fully beat-native** — beats are the source of truth; seconds are derived. |
| Time signature | **Configurable** `beats_per_measure`, default **4**. |
| Tempo / position model | **Detected beat-time table** persisted from analysis (accurate under tempo drift). |
| Beat resolution | **Half-beat (eighths)** — chord changes land on multiples of 0.5 beats. |
| Editing | **Drag handles (snap to 0.5 beat) + numeric beat-count stepper**, both. |
| Downbeats / bar lines | **Beat 0 = downbeat by default, with a user phase-nudge (`measure_offset`)**. |
| On-cell display | **Rhythm slash marks** (`C ╱ ╱ ╱`) + bar lines per measure; width ∝ beat count. |

## 1. Source of truth

Beats become the stored, editable truth. A chord knows it lasts e.g. *4 beats*; its
actual seconds are looked up from a detected **beat-time table** so playback stays
sample-accurate even when the recording's tempo drifts.

## 2. Data model (`app/models.py`)

- **`Analysis`** (immutable) gains `beat_times: JSON` — librosa's detected beat onsets in
  seconds. These are currently computed during analysis and discarded; we now keep them.
  Stored as a JSON array via SQLAlchemy's `JSON` type (works on SQLite).
- **`ChordChart`** (editable copy) gains:
  - `beats_per_measure: int` — default **4**.
  - `measure_offset: int` — default **0**; phase nudge for where bar lines fall.
  - `beat_times: JSON` — copied from `Analysis` at seed time so the chart is
    self-contained, mirroring the existing immutable-analysis / editable-chart split.
- **`ChordSegment`**: `start_beat: float` and `end_beat: float` (multiples of **0.5**)
  become the stored, editable fields. The `start_time` / `end_time` **columns are
  dropped** and instead **computed at serialization time** from the chart's beat grid —
  no redundant column that can drift. The `order_by` on the chart's `segments`
  relationship changes from `start_time` to `start_beat`.

### Beat↔time mapping (`app/audio/beatgrid.py`, new)

- Integer beat *i* → `beat_times[i]`.
- Half-beat *i.5* → midpoint of `beat_times[i]` and `beat_times[i+1]` (linear interp).
- Beat 0 is anchored to the first detected onset.
- Beats past the last onset extrapolate using the final inter-beat interval; the grid is
  clamped so the last chord can reach `duration`.
- Inverse mapping (time → fractional beat) used during seeding, with snapping to the
  nearest 0.5 beat.

## 3. Analysis → chart seeding

The existing segment-detection pipeline is unchanged. After detection:

1. Persist `beat_times` on the `Analysis` record.
2. Convert each segment's second-boundaries to fractional beats via inverse
   interpolation and **snap to the nearest 0.5 beat**.
3. Enforce contiguity (each chord's `start_beat` = previous chord's `end_beat`) and a
   0.5-beat minimum length.
4. Copy `beat_times` onto the new `ChordChart`.

For the steady-tempo 4/4 test file, every chord must seed to exactly 4 beats.

## 4. API (`app/schemas.py`, `app/routers/charts.py`)

- `AnalysisOut` += `beat_times`.
- `ChartOut` += `beats_per_measure`, `measure_offset`, `beat_times`.
- `SegmentOut` += `start_beat`, `end_beat`, and keeps **computed** `start_time` /
  `end_time` (so the audio element and seek logic are untouched on the client).
- `SegmentCreate` / `SegmentUpdate` switch to `start_beat` / `end_beat`, validated to
  ≥ 0 and to multiples of 0.5.
- New `PATCH /charts/{cid}` to set `beats_per_measure` / `measure_offset`.
- Reorder (`SegmentReorder`) recomputes beats so each chord keeps its beat count,
  analogous to today's second-based recompute.
- Invariant change: a chart's segments must fit within the grid (`end_beat ≤ grid max`),
  replacing the seconds-vs-`duration_seconds` check.

## 5. Frontend (`frontend/src/`)

- **`chart/Timeline.tsx`**: cell width ∝ **beat count** (`flex: beat_count`) instead of
  seconds span. Inside each cell render the chord name + **rhythm slash marks** — one
  slash per beat (`C ╱ ╱ ╱` = 4 beats), half-beats as a short tick. Draw **vertical bar
  lines** every `beats_per_measure` beats, offset by `measure_offset`.
- **`chart/chartLayout.ts`**: wrapping becomes **measure-aware** — group lines by a whole
  number of measures so bar lines stay regular (replaces the chord-count-per-line
  `chordsPerLine` heuristic).
- **Resize handles**: dragging still works but **snaps to the nearest 0.5 beat**;
  `timeMath` / `boundaryUpdates` operate in beats.
- **`chart/SegmentEditor.tsx`**: add a numeric **beat-count stepper** (0.5 steps) for the
  selected chord.
- New controls near `TransposeControl`: a **time-signature** control (beats per measure)
  and a **measure-phase nudge** (`measure_offset` ±).
- **`api/types.ts`**: updated to match the new `AnalysisOut` / `ChartOut` / `SegmentOut`
  shapes.

## 6. Migration

The project has no Alembic; tables are created via `Base.metadata.create_all` in the app
lifespan. Plan:

- Add the new columns to the models so fresh databases get them automatically.
- Provide a tiny one-off script (or document a `POST /recordings/{id}/analyze`
  re-analyze) to populate `beat_times` and per-segment beats on the existing `tabit.db`.
- Charts without beats are repopulated on next analysis (re-analysis already re-seeds the
  chart, overwriting manual edits — an existing documented behavior).

## 7. Testing

- `beatgrid` unit tests: beat↔time round-trip, half-beat interpolation, extrapolation
  past the last onset, time→beat snapping.
- Seeding test: steady 4/4 fixture (`audio/Simple I V IV I.m4a`) → every chord = 4 beats.
- Updated segment / chart API tests: beat fields on create/update, the new chart PATCH,
  and the beats-fit-grid invariant.
- Frontend tests: `chartLayout` measure-wrapping, slash-mark rendering, drag-snap to
  half-beat, and the beat-count stepper.

## Invariants preserved

- `Analysis` stays immutable; `ChordChart` stays the editable copy.
- Re-analysis creates a fresh `Analysis` and re-seeds the chart.
- A chart's segments never exceed the recording's playable extent (now expressed in
  beats against the grid).
- Chord boundaries reflect actual change points; leading/trailing silence is still
  trimmed before beats are assigned.

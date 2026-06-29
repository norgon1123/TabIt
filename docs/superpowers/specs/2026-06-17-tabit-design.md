# Tabit — Design Spec

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan

## Purpose

Turn practice voice memos (solo guitar) into editable chord charts so they can be
recalled and played later. The user uploads an audio file; the app analyzes it to find
chords, BPM, and key; renders an editable chord chart with each chord labeled by its
roman-numeral degree in the key; and persists the audio, the analysis, and the chart.

## Context & Constraints

- **Audio source:** Primarily solo guitar (possibly with humming/singing). Cleanest case
  for automatic chord estimation. (Note: iPhone Voice Memos export as `.m4a`, not `.mp4`;
  both, plus `.mp3`/`.wav`, are accepted via ffmpeg decoding.)
- **Deployment:** Self-hosted, accessible remotely (home server / small VPS), reachable
  from a phone after practice. **Multi-user** (each user has their own account and their own
  recordings/charts), exposed to the internet, so auth matters and the UI must be
  mobile-friendly.
- **Backend:** Single **Python FastAPI** service (chosen for one-language operational
  simplicity and native access to the audio-analysis ecosystem).
- **Frontend:** **React** SPA (richest ecosystem for audio/waveform components; interactive
  chord-chart editor is the deciding factor).
- **Key behavior:** "Change the key" means **transpose** — every chord shifts to the new
  key; roman numerals stay constant (I IV V remain I IV V); chord names change.

## Architecture

One **FastAPI** backend owns auth, file storage, persistence, the analysis pipeline, and all
music-theory logic. A **React** SPA is the only client. The backend is the single source of
truth for music theory (transposition, roman numerals); the client renders what the API
returns rather than recomputing theory locally.

## Backend Components

### Auth
- **Multiple users.** Each user has a username + password **hash** (argon2 or bcrypt).
  Registration creates an account; an initial admin user can be seeded via config.
- Login issues a **long-lived session** delivered in an **httpOnly cookie** so the device
  **stays logged in until the user explicitly logs out**. Logout invalidates the session
  server-side (the cookie/token is revoked, not merely cleared client-side).
- All recordings, charts, and analyses are **scoped to the owning user**; every data access
  filters by the authenticated user. A user can only see and modify their own data.
- 401 on auth failure or missing/revoked session.

### Storage & Persistence
- Uploaded audio is saved under a **configurable directory**, partitioned per user; a DB row
  references the file path.
- **SQLite** via SQLAlchemy holds users, sessions, metadata, analysis results, and charts
  (zero-ops for a small self-hosted deployment; swappable to Postgres later behind SQLAlchemy
  if the user count grows).

### Analysis Pipeline (core)
Stages: `decode (ffmpeg) → librosa load → beat tracking (BPM) → key estimation →
beat-synchronous chromagram → chord recognition → merge adjacent segments`.

- The **chord recognizer sits behind an interface**. v1 implementation: **librosa chroma +
  chord-template matching** (no ML, reliable install). A stronger recognizer (**madmom**)
  can be swapped in later without touching surrounding stages.
- **v1 chord vocabulary:** major and minor triads plus dominant/major/minor 7ths. Manual
  editing covers anything outside this set.
- BPM from librosa beat tracking; key (tonic + mode) from a Krumhansl-Schmuckler-style
  estimate over the chromagram.

### Background Jobs
- Analysis runs as an **in-process async background task** (not Celery/Redis — single user
  doesn't justify the infra).
- A status field tracks `PENDING / RUNNING / DONE / FAILED`; the frontend polls for status.

### Music Theory Module
- Pure, dependency-free, heavily unit-tested functions:
  - `transpose(chord, semitones)` — shift a chord's root.
  - `roman_numeral(chord, key)` — degree label for a chord within a key (case/quality aware:
    uppercase for major, lowercase for minor, etc.).
- No I/O. This is the most rigorously tested unit in the system.

## Data Model

- **User** — username, password hash, created time. Owns recordings/charts.
- **Session** — server-side record of an active login (token id, user, created time, optional
  device label), revoked on logout. Enables "stay logged in until logout" with server-side
  invalidation.
- **Recording** — owned by a User. File metadata: original filename, format, stored path,
  duration, upload time.
- **Analysis** — *immutable* machine output for a recording: BPM, detected key (tonic + mode),
  engine version, status, error message.
- **ChordChart** — the *editable* artifact, seeded from an Analysis: current key (tonic + mode).
- **ChordSegment** — belongs to a chart: `start_time`, `end_time`, `chord_root`,
  `chord_quality`. The **roman numeral is computed** from (segment chord, chart key) on
  read — not stored.

**Invariant:** Analysis is immutable; the ChordChart is the user-editable copy. Re-running
analysis creates a *new* Analysis and re-seeds the chart, with an explicit warning that this
overwrites manual edits.

## Data Flow

1. **Upload** → store file + create Recording → enqueue analysis job.
2. **Analysis job** → decode + analyze → write Analysis → seed ChordChart + ChordSegments →
   mark `DONE` (or `FAILED` with message).
3. **View** → frontend polls status, then loads the chart.
4. **Edit** → inline chord edits, drag segment boundaries (change points), **transpose**
   (PATCH updates chart key and shifts all segment roots) → persisted.
5. **Re-run analysis** → new job, re-seed chart (warn: overwrites edits).
6. **Delete** → remove file + DB rows.

## Frontend (React)

- **Login / Register** pages. Session persists on the device until the user chooses **Log out**.
- **Library** — the signed-in user's recordings with analysis status; upload, delete, re-run
  analysis.
- **Chart editor** — audio player synced to a **timeline of chord segments**; inline edit of
  each chord; drag segment boundaries to correct change points; key selector that transposes
  live; BPM display. Mobile-friendly layout.

## Error Handling

- Corrupt/unsupported audio → job marked `FAILED` with a surfaced message.
- Missing ffmpeg → detected at startup with a clear error.
- API validates inputs at the boundary: segment times within recording duration, segments
  non-overlapping, valid chord root/quality.
- 401 on auth failures.

## Testing Strategy

- **Music-theory functions** — exhaustive unit tests (transposition across all roots/keys,
  roman-numeral labeling for every degree and quality, enharmonic handling).
- **Analysis pipeline** — tests against a small fixture clip with known chords/BPM/key.
- **API endpoints** — auth, upload, status polling, edit/transpose, delete.
- **Frontend** — focused component tests for the chart editor interactions.

## Build Phases

1. **Backend skeleton** — auth, upload/storage, DB, analysis pipeline, chart seeding, REST API.
2. **React core** — library + upload + chart view + audio playback.
3. **Editing** — manual chord edits, boundary dragging, transpose.
4. **Polish** — re-run analysis, optional madmom recognizer upgrade, deployment.

## Decisions Locked In

- SQLite (vs Postgres) for v1.
- **Multi-user** with registration; per-user data scoping.
- **Persistent login** — device stays logged in until explicit logout, with server-side
  session revocation.
- In-process background jobs (vs task queue).
- v1 chord vocabulary = triads + 7ths.
- "Change key" = transpose (numerals invariant).

## Deferred / Out of Scope (v1)

- "Correct the key center" operation (relabel numerals without transposing) — possible future
  addition since numerals are already derived from key + chords.
- ML-based recognizer (madmom/autochord) — interface allows later swap.
- Role-based permissions / admin management UI (beyond a seeded admin user).
- Extended chord vocabulary beyond triads + 7ths in automatic detection.

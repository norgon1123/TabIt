# Tabit — Context

Turn practice voice memos into editable chord charts.

## What it is

A musician uploads a practice recording (voice memo / audio file). Tabit analyzes it
into tempo (BPM), musical key, and a sequence of chord segments, then produces an
**editable chord chart** the user can correct, re-segment, and transpose. The raw
analysis result is kept immutable; the chart is the user's working copy.

## Architecture

- **Backend** — FastAPI (Python ≥ 3.12), SQLAlchemy 2.0 (ORM), Pydantic v2. Audio
  analysis via librosa/numpy. Argon2 password hashing. **Server-side sessions** with a
  hashed token stored in an httpOnly cookie (`tabit_session`). SQLite by default.
- **Frontend** — React 18 + TypeScript SPA, Vite, TanStack Query, React Router.
- **Single origin** — the SPA talks to the API over REST and authenticates with the
  session cookie, so it must be served same-origin as the API. In dev, Vite proxies
  `/api` → `http://localhost:8000` to make this work.
- **Background analysis** — uploads enqueue an in-process job (thread pool, default 1
  worker); the API stays responsive while analysis runs and is polled for status.
- **Accounts are optional** — a logged-out visitor gets the whole experience for one song,
  stored nowhere. See *Guest mode*.

## Guest mode (`app/guest.py`, `app/chart_store.py`)

Anyone can upload a song and edit its chord sheet without registering. The point is a
frictionless trial that leaves nothing behind, so a guest's data lives *only* in memory:

- A `tabit_guest` browser-session cookie names one entry in the in-process `GuestStore`
  (`GuestRecording` → `GuestAnalysis` → `GuestChart` → `GuestSegment` — dataclasses that
  mirror the ORM models' attribute names). Nothing is written to the database.
- The uploaded audio is scratch space for the analysis job: `analyze_guest_recording`
  deletes it in a `finally`, so it is gone the moment processing ends either way. Playback
  in the chord sheet uses the browser's own copy (an object URL), not the server.
- One song at a time — a second upload during analysis is a `409`; after it, a new upload
  replaces the entry. Entries expire on an idle TTL (`TABIT_GUEST_TTL_SECONDS`).
- **`ChartStore` is the seam.** Every chart endpoint resolves a `Principal` (signed-in user
  or guest) to a `DbChartStore` or a `GuestChartStore` and then runs the *same* handler, so
  the two experiences cannot drift apart. `app/chart_seed.py` holds the seeding beat math
  both analysis paths share.

An account buys persistence: a stored library (`GET /api/recordings`, the one endpoint a
guest gets a `401` from), audio kept on disk, and several songs at once.

## Backend map (`app/`)

- `main.py` — app construction, router wiring, lifespan (creates tables, warns if
  ffmpeg missing, shuts down the job dispatcher). Health at `GET /api/health`.
- `config.py` — `TABIT_`-prefixed settings via pydantic-settings.
- `db.py`, `models.py`, `schemas.py` — engine/session, ORM models, Pydantic I/O shapes.
- `deps.py`, `security.py` — DB/session dependencies, `Principal` (user *or* guest),
  current-user resolution, Argon2.
- `guest.py`, `chart_store.py`, `chart_seed.py` — the account-free path: in-memory guest
  store, the user/guest storage seam the chart router talks to, and the shared chart seeding.
- `storage.py` — stores uploaded recording files under `TABIT_STORAGE_DIR`; guest audio goes
  to `_guest/` and is swept at startup.
- `jobs.py` — `JobDispatcher`: in-process background analysis worker (DB and guest jobs).
- `music_theory.py` — pitch-class/key/transpose helpers.
- `routers/` — `auth.py`, `recordings.py`, `charts.py`.
- `audio/` — the analysis pipeline:
  - `decode.py` — decode to mono (uses ffmpeg); `ffmpeg_available()`.
  - `analyzer.py` — orchestrates the pipeline; `ENGINE_VERSION = "template-v1"`.
  - `key_estimation.py` — tonic pitch class + mode from chroma.
  - `recognizer.py` — template-matching chord recognition.
  - `segments.py` — beat boundaries + segment merging.

## Data model (`app/models.py`)

- **User** — `username` (unique), `password_hash` (Argon2). Owns recordings + sessions.
- **Session** — server-side session: `token_hash` (the cookie carries the raw token).
- **Recording** — `original_filename`, `format`, `stored_path`, `duration_seconds`,
  `status` (default `uploaded`). 1:1 with Analysis and with ChordChart.
- **Analysis** — immutable result: `status` (`pending`/`running`/`done`/`failed`),
  `bpm`, `detected_key_tonic`, `detected_key_mode`, `engine_version`, `error`. 1:1 per
  recording (`recording_id` unique).
- **ChordChart** — the editable chart: `key_tonic`, `key_mode`. 1:1 per recording.
- **ChordSegment** — `start_time`, `end_time` (seconds, float), `chord_root`,
  `chord_quality`. Ordered by `start_time` within a chart.

## Analysis pipeline (`app/audio/analyzer.py`, `app/jobs.py`)

1. Decode audio to mono (resampled to `TABIT_ANALYSIS_SAMPLE_RATE`, default 22050 Hz).
2. Detect BPM via librosa beat tracking (`librosa.beat.beat_track`).
3. Estimate key — tonic pitch class + mode — from mean chroma.
4. Recognize chord labels via template matching, then merge into segments along beat
   boundaries. Engine tag: `template-v1`.
5. Write the immutable `Analysis` record.
6. Seed a new editable `ChordChart` (+ `ChordSegment`s) from the detected chords.

Status lifecycle, polled via `GET /api/recordings/{id}/analysis`:
`pending → running → done | failed` (on failure, `Analysis.error` carries the reason).

## API surface

- **Auth** (`/api/auth`): `POST /register`, `POST /login`, `POST /logout`, `GET /me`.
- **Recordings** (`/api/recordings`): `GET ""` (list), `POST ""` (upload),
  `GET /{id}`, `GET /{id}/analysis`, `POST /{id}/analyze` (202), `GET /{id}/audio`,
  `DELETE /{id}`.
- **Charts** (`/api`): `POST /recordings/{rid}/chart`, `GET /recordings/{rid}/chart`,
  `POST /charts/{cid}/segments`, `PATCH /charts/{cid}/segments/{sid}`,
  `DELETE /charts/{cid}/segments/{sid}`, `POST /charts/{cid}/transpose`.

Every one of these serves a guest as well as a signed-in user, with three exceptions that
exist because a guest has no library and no stored audio: `GET /api/recordings` (401),
`POST /{id}/analyze` (409 — re-upload instead), and `GET /{id}/audio` (404 once analysis has
finished and the file has been deleted).

## Frontend map (`frontend/src/`)

- `api/` — typed REST client (`client.ts`), `types.ts`, `music.ts`.
- `auth/` — `AuthContext` (session-cookie auth state).
- `pages/` — `HomePage` (library when signed in, `GuestHomePage` when not),
  `GuestHomePage` (upload + the chord sheet, on one page), `LibraryPage`,
  `ChartEditorPage`, `LoginPage`, `RegisterPage`.
- `chart/` — `ChartSheet` (the chord sheet both pages render), `useChart` (state/query
  hook), `useRecording`, `Timeline`, `SegmentEditor`, `TransposeControl`, `chartLayout`
  (chart wrapping/layout), `timeMath` (time math).
- `guest/` — `useGuestSong`: holds the visitor's File for playback (the server deleted its
  copy) and for re-analysis (which re-uploads it).
- `library/` — `useRecordings`, `uploadRecording` (the one upload path, guest or not),
  `UploadDropzone` (drag-and-drop or file picker), `audioDuration`.
- `components/` — `Header`, `ProtectedRoute`, `AnalysisStatusBadge`.

## Invariants (don't break these)

- `Analysis` is **immutable**; `ChordChart` is the editable copy.
- Re-running analysis (`POST /api/recordings/{id}/analyze`) creates a fresh `Analysis`
  and **re-seeds the chart, overwriting the user's manual edits.**
- A chart's segments must **never exceed the recording's total duration**
  (`Recording.duration_seconds`).
- Start/end times are shown and configured to **centisecond precision** (round 2 #5),
  universally — quantize via `roundCs`/`formatTimeCs`.
- Chord boundaries should reflect the *actual* change point; leading/trailing silence
  is trimmed and ignored.
- **ffmpeg must be on `PATH`** for analysis to run (uploads succeed without it; jobs
  then fail with a clear, logged error).
- **A guest leaves nothing behind.** No guest data may be written to the database, and their
  audio must be deleted as soon as processing ends — that deletion is the feature, not a
  cleanup detail. Anything a guest can edit must go through `ChartStore` so the guest and
  signed-in chord sheets stay identical by construction.

> Several of these are open work items — see `docs/TODO.md` — not yet fully enforced in
> code. Treat them as the intended contract when changing analysis or chart behavior.

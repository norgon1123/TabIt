# Tabit — backend

Turn practice voice memos into editable chord charts.

## Setup

    python -m venv .venv && . .venv/bin/activate
    pip install -e ".[dev]"

### System Dependencies

FFmpeg must be installed and on `PATH` for audio analysis to work:

- **macOS:** `brew install ffmpeg`
- **Debian/Ubuntu:** `apt install ffmpeg`

Without ffmpeg, recording uploads succeed but analysis jobs fail with a clear error. A clear error is logged at startup if ffmpeg is not found.

## Run

    uvicorn app.main:app --reload

API docs at http://localhost:8000/docs

## Test

    pytest

## Config (env vars, prefix `TABIT_`)

- `TABIT_DATABASE_URL` (default `sqlite:///./tabit.db`)
- `TABIT_STORAGE_DIR` (default `./storage`)
- `TABIT_COOKIE_SECURE` (`true` behind HTTPS)
- `TABIT_ANALYSIS_SAMPLE_RATE` (default `22050` Hz; audio resample target for analysis)
- `TABIT_ANALYSIS_MAX_WORKERS` (default `1`; background analysis worker threads)
- `TABIT_MAX_RECORDING_SECONDS` (default `600`, i.e. 10 minutes; longer uploads are
  rejected with `413`)
- `TABIT_GUEST_COOKIE_NAME` (default `tabit_guest`; names a logged-out visitor's in-memory
  recording — see *Guest mode*)
- `TABIT_GUEST_TTL_SECONDS` (default `3600`; a guest recording is dropped after this much
  idle time, the timer sliding on each request)

## Guest mode (no account)

A logged-out visitor can upload one song, have it analyzed, and edit the resulting chord
sheet — the same endpoints, the same chart, the same editing rules a signed-in user gets.
The difference is what survives:

- **Nothing is written to the database.** The recording, its analysis and its chart live in
  an in-process store (`app/guest.py`), keyed by the hash of a `tabit_guest` browser-session
  cookie.
- **The uploaded audio is deleted the moment analysis ends**, success or failure. It exists
  on disk (under `<storage>/_guest/`) only while the analyzer is reading it. Playback in the
  chord sheet therefore comes from the browser's own copy of the file, not from the server;
  `GET /api/recordings/{id}/audio` 404s for a guest once analysis is done, and re-analyzing
  means re-uploading (`POST .../analyze` answers `409`). Startup sweeps `<storage>/_guest/`
  in case a process died mid-analysis.
- **One song at a time.** Uploading while an analysis is running is refused with `409`;
  uploading after it finishes replaces the previous song. Entries also expire
  (`TABIT_GUEST_TTL_SECONDS`).

An account is what buys persistence: a library (`GET /api/recordings` is the one endpoint a
guest cannot reach — `401`), stored audio, and several songs at once.

## Analysis Flow

Upload rejects anything longer than `TABIT_MAX_RECORDING_SECONDS` (10 minutes by default).
The length is taken from `ffprobe` on the stored file, not from the browser — a client can
under-report it. If ffprobe isn't on `PATH` the length can't be established and the upload
is allowed through (analysis then fails with the usual missing-ffmpeg error).

Uploading a recording enqueues an in-process background job that:

1. Decodes the audio to mono and records its true duration (used in place of the
   browser-reported length, so charts never run past the end of the audio)
2. Trims leading/trailing silence so the chart spans only the audible region
3. Detects BPM via beat tracking
4. Estimates key (tonic pitch class and mode)
5. Recognizes chord segments using template matching over high-resolution chroma
   with frame-accurate change boundaries (`template-v2`)
6. Creates an immutable `Analysis` record with results
7. Seeds a new editable `ChordChart` with the detected chords

Poll `GET /api/recordings/{id}/analysis` to monitor the `Analysis` status: `pending` → `running` → `done` or `failed`.

## API Endpoints

### Analysis

- `GET /api/recordings/{id}/analysis` — Fetch analysis status and results (e.g., BPM, key, detected chord segments)
- `POST /api/recordings/{id}/analyze` — Trigger analysis (re-run creates a fresh Analysis and re-seeds the chart, overwriting prior manual edits; returns 202 Accepted)

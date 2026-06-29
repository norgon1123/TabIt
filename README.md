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

## Analysis Flow

Uploading a recording enqueues an in-process background job that:

1. Decodes the audio to mono
2. Detects BPM via beat tracking
3. Estimates key (tonic pitch class and mode)
4. Recognizes chord segments using template matching (`template-v1`)
5. Creates an immutable `Analysis` record with results
6. Seeds a new editable `ChordChart` with the detected chords

Poll `GET /api/recordings/{id}/analysis` to monitor the `Analysis` status: `pending` → `running` → `done` or `failed`.

## API Endpoints

### Analysis

- `GET /api/recordings/{id}/analysis` — Fetch analysis status and results (e.g., BPM, key, detected chord segments)
- `POST /api/recordings/{id}/analyze` — Trigger analysis (re-run creates a fresh Analysis and re-seeds the chart, overwriting prior manual edits; returns 202 Accepted)

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

### Multi-instrument pipeline (Phase 0/1)

The separation + deep-model work needs the heavy ML stack, kept out of the base install:

    pip install -e ".[ml]"        # torch, torchaudio, demucs, mir_eval

The inference box pins Python to a version with `cu128` torch + Demucs wheels (≈3.12) —
see `docs/technical-plan-phase-0-1.md`. Config vars (all default to the app being
unchanged):

- `TABIT_ANALYSIS_DEVICE` (default `auto`; `auto` → cuda → mps → cpu, or force one)
- `TABIT_ENABLE_SEPARATION` (default `false`)
- `TABIT_SEPARATION_MODEL` (default `htdemucs_6s`; the only 6-source Demucs model)
- `TABIT_STEM_STORAGE` (default `persist`) / `TABIT_STEM_FORMAT` (default `flac`)

Phase 0 tools (see the roadmap and technical plan under `docs/`):

    # score an engine against a ground-truth set of audio + .lab pairs
    python scripts/eval_chords.py --dataset tests/eval --engine librosa --baseline chordino
    # generate a starter .lab to hand-correct into ground truth
    python scripts/bootstrap_labels.py path/to/clip.m4a --engine chordino
    # Demucs separation timing/VRAM spike
    python scripts/separation_spike.py path/to/song.m4a --out-dir /tmp/stems

## Analysis Flow

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

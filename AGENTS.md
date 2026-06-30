# AGENTS.md — Tabit

Operating instructions for coding agents working in this repo. Read **CONTEXT.md** first
for the architecture and data model; this file is the *how-to-work* manual.

## Prerequisites

- Python ≥ 3.12 and Node (for the frontend).
- **ffmpeg on `PATH`** — required for audio analysis. `brew install ffmpeg`
  (macOS) / `apt install ffmpeg` (Debian/Ubuntu). Without it, uploads work but analysis
  jobs fail with a clear error.

## Setup

    python -m venv .venv && . .venv/bin/activate
    pip install -e ".[dev]"
    cd frontend && npm install

## Run

- Backend: `uvicorn app.main:app --reload` — API docs at http://localhost:8000/docs
- Frontend: `cd frontend && npm run dev` — http://localhost:5173 (proxies `/api` → :8000)
- Run **both** for a working app: cookie auth needs the SPA and API to be same-origin,
  which the dev proxy provides.

## Test (run the relevant suite before claiming a change is done)

- Backend: `pytest` — config in `pyproject.toml` (`testpaths = ["tests"]`, `-v`).
- Frontend: `cd frontend && npm test` — Vitest (jsdom) + Testing Library + MSW. Tests
  are colocated as `*.test.ts(x)` next to the source they cover.

## Build

- Frontend: `cd frontend && npm run build` — runs `tsc -b` (type-check) then emits
  static assets to `frontend/dist/`. Use this to verify TS changes type-check.

## Conventions

- **Config is env-driven**, prefix `TABIT_` (`app/config.py`). Don't hardcode paths or
  secrets. Known vars: `TABIT_DATABASE_URL`, `TABIT_STORAGE_DIR`, `TABIT_COOKIE_SECURE`
  (`true` behind HTTPS), `TABIT_ANALYSIS_SAMPLE_RATE` (default 22050),
  `TABIT_ANALYSIS_MAX_WORKERS` (default 1). Session knobs also exist
  (`TABIT_SESSION_COOKIE_NAME`, `TABIT_SESSION_MAX_AGE_SECONDS`).
- **Backend** — REST handlers in `app/routers/` (auth → `/api/auth`, recordings →
  `/api/recordings`, charts → `/api`); audio logic in `app/audio/`; Pydantic request/
  response shapes in `app/schemas.py`; ORM models in `app/models.py`. Keep `Analysis`
  immutable — never mutate an existing analysis record; create a new one.
- **Frontend** — fetch/mutate through TanStack Query hooks (`useChart`,
  `useRecordings`), not ad-hoc fetches. Time arithmetic belongs in `chart/timeMath.ts`;
  chart wrapping/layout in `chart/chartLayout.ts`.
- New API fields: update `app/schemas.py` **and** `frontend/src/api/types.ts` together.

## Rules that bite (enforce in any chart/analysis change)

- A chart's total length must **never exceed the recording's duration**
  (`Recording.duration_seconds`).
- All start/end times are **millisecond precision** — everywhere, no exceptions.
- Chord boundaries must reflect the real change point; trim leading/trailing silence.
- Re-running analysis (`POST /api/recordings/{id}/analyze`, 202) **overwrites the user's
  manual chart edits** — call this out explicitly if your change touches that path.
- ffmpeg is required at runtime for analysis; don't assume it's present in code paths
  that can run without it.

## Definition of done

- The relevant test suite passes (`pytest` and/or `cd frontend && npm test`); frontend
  changes type-check (`npm run build`).
- New behavior has tests in the matching suite (backend `tests/`, frontend colocated
  `*.test.ts(x)`).
- Env/config changes are reflected in `app/config.py` and documented in `README.md`.
- Don't silently regress the open items in `docs/TODO.md`.

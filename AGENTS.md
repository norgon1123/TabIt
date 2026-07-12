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

### Bug fixes specifically

A bug fix is **not done** until all of the following hold:

1. **Reproduced.** You can trigger the reported failure yourself and have identified the
   root cause — not just the symptom. State the root cause in the change.
2. **Failing test first.** A test in the matching suite reproduces the bug and *fails for
   the right reason* before the fix (watch it fail). The reproduction must exercise the
   real failing path, not a mock of it.
3. **Proven by that test.** The same test passes after the fix, and the full relevant
   suite still passes.
4. **Fixed at the root, not the symptom.** Patching one stale database or one call site
   is not a fix — make the code self-correct so the failure can't recur (e.g. the bug is
   fixed in the app, not by hand-editing data).
5. **Regression locked in.** The new test stays in the suite so the bug can't silently
   return.

> Schema gotcha that has bitten deletes before: `Base.metadata.create_all()` creates
> missing *tables* but never adds *columns* to existing ones, so a pre-existing SQLite DB
> keeps its old schema and the ORM fails on the new column. New columns must be added via
> `app/migrations.py` (`run_additive_migrations`, run automatically on startup and by
> `scripts/migrate_beats.py`) — not by relying on `create_all`.

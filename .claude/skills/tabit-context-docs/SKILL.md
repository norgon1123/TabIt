---
name: tabit-context-docs
description: Use when creating or updating Tabit's CONTEXT.md (architecture orientation) or AGENTS.md (agent operating instructions), or when the user asks to "generate context docs", "refresh CONTEXT.md", "write AGENTS.md", or onboard a new agent/contributor to the Tabit repo.
---

# Tabit Context Docs

Generate and maintain two root-level docs for the Tabit repo:

- **CONTEXT.md** — the *mental model*. What Tabit is, how the pieces fit, the data model, the analysis pipeline, and the invariants. Audience: anyone (human or agent) who needs to understand the system before touching it.
- **AGENTS.md** — the *operating manual*. Commands, conventions, gotchas, and the definition of done. Audience: a coding agent about to make a change.

Keep them disjoint: CONTEXT.md explains *what is true*; AGENTS.md tells you *what to do*. Don't duplicate command lists into CONTEXT.md or architecture prose into AGENTS.md.

## Core rule: verify before you write

**Every fact in these files must be checked against the current code, not recalled from this skill.** The templates below capture Tabit as of authoring; the repo drifts. Before writing each section, confirm it:

| Claim | Verify against |
|-------|----------------|
| Stack / deps / Python version | `pyproject.toml`, `frontend/package.json` |
| Commands (run/test/build) | `README.md`, `frontend/README.md`, the `scripts` in `package.json`, `[tool.pytest.ini_options]` |
| Env vars | `app/config.py` (and `README.md` config section) |
| Backend module map | `app/` and `app/audio/`, `app/routers/` |
| Data model | `app/models.py` |
| Analysis pipeline steps | `app/audio/analyzer.py` and `app/jobs.py` |
| API endpoints | `app/routers/*.py` |
| Frontend structure | `frontend/src/` |
| Open constraints / rules | `docs/TODO.md`, `docs/INITIAL-REVIEW.md` |

If a template line contradicts the code, the code wins — update the line. If a file/module named below no longer exists, drop it.

## Workflow

1. **Detect mode.** If `CONTEXT.md` / `AGENTS.md` exist, you're *updating* (preserve human edits, reconcile drift). Otherwise *creating* from the templates.
2. **Gather facts** by reading the files in the table above. Prefer a single broad read pass over the relevant dirs.
3. **Write CONTEXT.md** from the template, replacing each section with verified content.
4. **Write AGENTS.md** from the template, same discipline.
5. **Cross-check** the two don't contradict each other (e.g. same test command, same invariants worded consistently).
6. **Report** which facts you verified and any drift you corrected, so the user can sanity-check.

When updating, do a section-by-section diff in your head: keep prose the user clearly hand-wrote, replace anything the code has outgrown, and add sections for newly-added subsystems.

## Tabit facts (verify each — see table above)

These are the load-bearing truths that make the docs useful. Confirm, then fold into the right file.

- **Two services, one origin.** FastAPI backend (`app/`) + React/TS/Vite SPA (`frontend/`). Auth is an httpOnly **session cookie**, so the SPA must be served same-origin as the API (dev: Vite proxies `/api` → `:8000`).
- **Audio analysis is the heart.** Upload → in-process background job (`app/jobs.py`) → decode mono → BPM (beat tracking) → key (tonic + mode) → chord segments via template matching (`template-v1`) → immutable `Analysis` → seed editable `ChordChart`. Poll `GET /api/recordings/{id}/analysis`: `pending → running → done|failed`.
- **`Analysis` is immutable; `ChordChart` is editable.** Re-running analysis (`POST /api/recordings/{id}/analyze`, 202) creates a fresh `Analysis` and **re-seeds the chart, overwriting manual edits.** This is a sharp edge — say so.
- **ffmpeg is a hard runtime dependency.** Without it, uploads succeed but analysis jobs fail with a clear error (logged at startup too).
- **Config is env-driven, prefix `TABIT_`** (`app/config.py`): `TABIT_DATABASE_URL`, `TABIT_STORAGE_DIR`, `TABIT_COOKIE_SECURE`, `TABIT_ANALYSIS_SAMPLE_RATE`, `TABIT_ANALYSIS_MAX_WORKERS`.
- **Product rules from `docs/TODO.md`** that affect any chart/analysis change — treat as invariants:
  - Charts must **never exceed the audio file's total duration.**
  - Times are configured/displayed to **millisecond precision** — universal rule.
  - Chord changes must align to the *actual* change point; leading/trailing silence is trimmed and ignored.

## CONTEXT.md template

```markdown
# Tabit — Context

Turn practice voice memos into editable chord charts.

## What it is
<One paragraph: a user uploads a recording; Tabit analyzes it into BPM/key/chord
segments and produces an editable chord chart they can correct and transpose.>

## Architecture
- **Backend** — FastAPI (Python >=3.12), SQLAlchemy 2.0, Pydantic v2. Audio analysis
  via librosa/numpy. Argon2 password hashing, cookie session auth. SQLite by default.
- **Frontend** — React 18 + TypeScript SPA, Vite, TanStack Query, React Router.
- **Single origin** — the SPA talks to the API over REST with an httpOnly session
  cookie, so it must be served same-origin (dev: Vite proxies `/api` → `:8000`).

## Backend map (`app/`)
- `main.py` — app + router wiring
- `config.py` — `TABIT_`-prefixed settings (pydantic-settings)
- `db.py`, `models.py`, `schemas.py` — persistence + I/O shapes
- `deps.py`, `security.py` — auth/session dependencies, password hashing
- `storage.py` — recording file storage (`TABIT_STORAGE_DIR`)
- `jobs.py` — in-process background analysis worker
- `routers/` — `auth.py`, `recordings.py`, `charts.py`
- `audio/` — `decode.py`, `analyzer.py`, `key_estimation.py`, `recognizer.py`,
  `segments.py`; `music_theory.py` at app root

## Data model (`app/models.py`)
<User, Recording, Analysis (immutable result), ChordChart (editable). Note the
relationships and which fields are authoritative.>

## Analysis pipeline (`app/audio/analyzer.py`, `app/jobs.py`)
1. Decode audio to mono
2. Detect BPM (beat tracking)
3. Estimate key (tonic pitch class + mode)
4. Recognize chord segments (template matching, `template-v1`)
5. Write immutable `Analysis`
6. Seed a new editable `ChordChart`

Status lifecycle: `pending → running → done | failed`
(poll `GET /api/recordings/{id}/analysis`).

## Frontend map (`frontend/src/`)
- `api/` — typed client + REST types
- `auth/` — `AuthContext`
- `pages/` — Library, ChartEditor, Login, Register
- `chart/` — `useChart`, `Timeline`, `SegmentEditor`, `TransposeControl`,
  `chartLayout`, `timeMath`
- `library/` — recordings list + upload
- `components/` — Header, ProtectedRoute, AnalysisStatusBadge

## Invariants (don't break these)
- `Analysis` is immutable; `ChordChart` is editable.
- Re-running analysis overwrites the chart's manual edits.
- Charts must never exceed the audio's total duration.
- All times use millisecond precision (universal rule).
- ffmpeg must be on PATH for analysis to run.
```

## AGENTS.md template

```markdown
# AGENTS.md — Tabit

Operating instructions for coding agents in this repo. Read CONTEXT.md first for the
mental model.

## Prerequisites
- Python >= 3.12, Node (for the frontend).
- **ffmpeg on PATH** — required for audio analysis (`brew install ffmpeg`).

## Setup
    python -m venv .venv && . .venv/bin/activate
    pip install -e ".[dev]"
    cd frontend && npm install

## Run
- Backend: `uvicorn app.main:app --reload`  (API docs at http://localhost:8000/docs)
- Frontend: `cd frontend && npm run dev`  (http://localhost:5173, proxies `/api`)
- Run both for a working app (cookie auth needs same-origin via the dev proxy).

## Test (run the relevant suite before claiming done)
- Backend: `pytest`  (config in `pyproject.toml`, tests in `tests/`)
- Frontend: `cd frontend && npm test`  (Vitest + Testing Library + MSW; tests are
  colocated as `*.test.ts(x)` next to source)

## Build
- Frontend: `cd frontend && npm run build`  (type-checks, emits `frontend/dist/`)

## Conventions
- Config via env vars, prefix `TABIT_` (see `app/config.py`). Don't hardcode paths/secrets.
- Backend: routers in `app/routers/`, audio logic in `app/audio/`, Pydantic schemas in
  `app/schemas.py`. Keep `Analysis` immutable.
- Frontend: data fetching through TanStack Query hooks (`useChart`, `useRecordings`);
  time math lives in `chart/timeMath.ts`.

## Rules that bite (enforce in any chart/analysis change)
- Chart total length must never exceed the audio file's duration.
- All start/end times are millisecond-precision — everywhere, no exceptions.
- Chord boundaries must reflect the real change point; trim leading/trailing silence.
- Re-running analysis overwrites manual chart edits — call this out if a change touches it.

## Definition of done
- Relevant tests pass (`pytest` and/or `npm test`); frontend changes type-check (`npm run build`).
- New behavior has tests in the matching suite.
- Env/config changes documented in `README.md` and reflected in `app/config.py`.
- Open items live in `docs/TODO.md` — don't silently regress them.
```

## Common mistakes

- **Copying the template verbatim** without checking the code — the module list or
  endpoints may have changed. Verify, then write.
- **Bloating AGENTS.md with architecture** or **stuffing CONTEXT.md with commands.** Keep the split.
- **Dropping the sharp edges** (immutable Analysis, re-analysis overwrites edits, ms precision, ffmpeg). These are exactly what saves the next agent.
- **Overwriting hand-written prose on update.** Reconcile drift; preserve intentional human edits.

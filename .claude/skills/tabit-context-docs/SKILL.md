---
name: tabit-context-docs
description: Use when creating or updating Tabit's CONTEXT.md (architecture orientation) or AGENTS.md (agent operating instructions), or when the user asks to "generate context docs", "refresh CONTEXT.md", "write AGENTS.md", or onboard a new agent/contributor to the Tabit repo.
---

# Tabit Context Docs

Generate and maintain two root-level docs for the Tabit repo:

- **CONTEXT.md** — the *mental model*. What Tabit is, how the pieces fit, the data model, the analysis pipeline, and the invariants. Audience: anyone (human or agent) who needs to understand the system before touching it.
- **AGENTS.md** — the *operating manual*. Commands, conventions, gotchas, and the definition of done. Audience: a coding agent about to make a change. This is the canonical instructions file (the tool-agnostic standard).
- **CLAUDE.md** — a symlink to `AGENTS.md`, so Claude Code auto-loads the operating manual without maintaining a second copy. Never edit `CLAUDE.md` directly; edit `AGENTS.md` and let the symlink follow.

Keep CONTEXT.md and AGENTS.md disjoint: CONTEXT.md explains *what is true*; AGENTS.md tells you *what to do*. Don't duplicate command lists into CONTEXT.md or architecture prose into AGENTS.md.

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
5. **Link CLAUDE.md → AGENTS.md.** Ensure `CLAUDE.md` is a relative symlink to `AGENTS.md` so Claude Code auto-loads the operating manual:

       ln -sf AGENTS.md CLAUDE.md   # run from the repo root

   If a real `CLAUDE.md` file already exists (not a symlink), fold any unique content into `AGENTS.md` first, then replace it with the symlink. Verify with `ls -l CLAUDE.md` (should show `CLAUDE.md -> AGENTS.md`).
6. **Cross-check** CONTEXT.md and AGENTS.md don't contradict each other (e.g. same test command, same invariants worded consistently).
7. **Report** which facts you verified and any drift you corrected, so the user can sanity-check.

When updating, do a section-by-section diff in your head: keep prose the user clearly hand-wrote, replace anything the code has outgrown, and add sections for newly-added subsystems.

**Never drop these on update (load-bearing best practices, carry them forward verbatim unless the user changed them):**
- The **Bug fixes specifically** definition of done (reproduce → failing test first → prove → root-cause fix → regression lock).
- The **`create_all` schema gotcha** (new columns need `app/migrations.py`, not `create_all`).

These live in the AGENTS.md template below precisely so they survive regeneration. If a future best practice must persist the same way, add it to the template here — not only to the generated file.

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

### Bug fixes specifically
A bug fix is **not done** until all of the following hold:
1. **Reproduced.** You can trigger the reported failure yourself and have identified the
   root cause — not just the symptom. State the root cause in the change.
2. **Failing test first.** A test in the matching suite reproduces the bug and *fails for
   the right reason* before the fix (watch it fail). Exercise the real failing path, not a
   mock of it.
3. **Proven by that test.** The same test passes after the fix, and the full relevant
   suite still passes.
4. **Fixed at the root, not the symptom.** Patching one stale database or one call site is
   not a fix — make the code self-correct so the failure can't recur.
5. **Regression locked in.** The new test stays in the suite so the bug can't silently return.

> Schema gotcha that has bitten deletes before: `Base.metadata.create_all()` creates
> missing *tables* but never adds *columns* to existing ones, so a pre-existing SQLite DB
> keeps its old schema and the ORM fails on the new column. New columns must be added via
> `app/migrations.py` (`run_additive_migrations`, run on startup and by
> `scripts/migrate_beats.py`) — not by relying on `create_all`.
```

## Common mistakes

- **Copying the template verbatim** without checking the code — the module list or
  endpoints may have changed. Verify, then write.
- **Bloating AGENTS.md with architecture** or **stuffing CONTEXT.md with commands.** Keep the split.
- **Dropping the sharp edges** (immutable Analysis, re-analysis overwrites edits, ms precision, ffmpeg). These are exactly what saves the next agent.
- **Overwriting hand-written prose on update.** Reconcile drift; preserve intentional human edits.
- **Editing CLAUDE.md directly or committing it as a real file.** It's a symlink to AGENTS.md — edit AGENTS.md instead, and make sure the symlink (not a copied file) is what's committed.
- **Dropping the load-bearing best practices** (Bug-fix definition of done, the `create_all` schema gotcha). They are baked into the template above so regeneration retains them — keep them.

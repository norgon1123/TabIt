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

Optional extras — **not** needed for the base app, tests, or most changes:

    pip install --no-build-isolation -e ".[chordino]"  # Tier 2 engine; also needs the
                                                       # native nnls-chroma Vamp plugin
    pip install -e ".[ml]"                             # torch/demucs/mir_eval (Phase 0/1)

`[ml]` is heavy and its torch wheels are installed from the PyTorch index first — see the
comment in `pyproject.toml` and `docs/technical-plan-phase-0-1.md`.

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
  secrets. Core vars: `TABIT_DATABASE_URL`, `TABIT_STORAGE_DIR`, `TABIT_COOKIE_SECURE`
  (`true` behind HTTPS), `TABIT_ANALYSIS_SAMPLE_RATE` (22050),
  `TABIT_ANALYSIS_MAX_WORKERS` (1), `TABIT_ANALYSIS_MIN_SEGMENT_SECONDS` (0.75),
  `TABIT_ANALYSIS_CHANGE_PENALTY` (1.0), `TABIT_ANALYSIS_USE_HPSS` (true),
  `TABIT_ANALYSIS_ENGINE` (`chordino` | `librosa` | `btc`). Session knobs:
  `TABIT_SESSION_COOKIE_NAME`, `TABIT_SESSION_MAX_AGE_SECONDS`. Multi-instrument knobs:
  `TABIT_ANALYSIS_DEVICE` (`auto`), `TABIT_ENABLE_SEPARATION` (false),
  `TABIT_SEPARATION_MODEL`, `TABIT_SEPARATION_STEMS`, `TABIT_STEM_STORAGE`,
  `TABIT_STEM_FORMAT`.
- **Backend** — REST handlers in `app/routers/` (auth → `/api/auth`, recordings →
  `/api/recordings`, charts → `/api`); audio logic in `app/audio/`; Pydantic request/
  response shapes in `app/schemas.py`; ORM models in `app/models.py`. Keep `Analysis`
  immutable — never mutate an existing analysis record; create a new one.
- **Beat↔time conversion belongs in `app/audio/beatgrid.py`** (`time_for_beat`,
  `beat_for_time`, `total_beats`, `snap_half`) — don't re-derive it inline, and don't
  reintroduce seconds-valued segment columns.
- **Frontend** — fetch/mutate through TanStack Query hooks (`useChart`, `useRecordings`),
  not ad-hoc fetches. Beat math belongs in `chart/beatMath.ts` / `chart/beatGrid.ts`;
  pixel↔time and time formatting in `chart/timeMath.ts`; chart wrapping/layout in
  `chart/chartLayout.ts`.
- **Heavy deps stay lazy.** torch/demucs/`vamp` are optional extras — import them inside
  the function that needs them, never at module top level, so the base app keeps
  installing and running without them.
- New API fields: update `app/schemas.py` **and** `frontend/src/api/types.ts` together.

## Schema changes: the data is disposable

Tabit is in **early development and has no production data.** Data-breaking changes are
therefore **fine and expected** — schema is free to change shape whenever the design calls
for it. Don't contort a model to stay backward-compatible with rows already on disk.

- **Do not write migration scripts.** Not Alembic, not new additive `ALTER TABLE` steps in
  `app/migrations.py`. They are not required and not wanted at this stage.
- **The fix for a stale local DB is to delete it**, not to migrate it. Drop the SQLite file
  (`tabit.db`, per `TABIT_DATABASE_URL`) and restart — `Base.metadata.create_all()` in the
  `main.py` lifespan rebuilds the schema from `app/models.py`. Clear `TABIT_STORAGE_DIR`
  too if stored recordings would be orphaned by the change.
- **Say so in the change.** If your change breaks existing rows, state plainly that the dev
  DB must be dropped and recreated — don't let a teammate discover it as an ORM error.
- `app/migrations.py` still exists and still runs on startup; leave the migrations already
  in it alone. It is dormant until Tabit has real data to preserve, at which point this rule
  gets revisited (see `docs/multi-instrument-roadmap.md`).

## Rules that bite (enforce in any chart/analysis change)

- A chart's total length must **never exceed the recording's duration**. `end_beat` is
  bounded by `total_beats(grid, duration)`, where `duration` is the *server-decoded*
  length (`Recording.duration_seconds`), not the browser-reported one.
- **Charts are beat-native.** Segments are stored as `start_beat`/`end_beat` on a beat
  grid; seconds are derived, never persisted. Positions snap to the **half-beat**
  (minimum segment 0.5 beats); derived times are **displayed to the centisecond**
  (`roundCs`/`formatTimeCs`). If you see "millisecond precision" in an older note, it is
  stale — `docs/TODO.md` #7 was superseded by Round 2 #5 (centisecond display) and then by
  the beat-native rewrite.
- **BPM is a whole number** everywhere it is detected, stored, sent or shown — a tempo is
  something a player counts, not a measurement. Round through `whole_bpm`
  (`app/audio/beatgrid.py`); the API rounds a fractional `PATCH .../tempo` rather than
  rejecting it, and rounds charts analysed before this rule on the way out. Timing accuracy
  lives in `beat_times`, never in this number, so rounding costs nothing.
- Chord boundaries must reflect the real change point; trim leading/trailing silence.
- Re-running analysis (`POST /api/recordings/{id}/analyze`, 202) **overwrites the user's
  manual chart edits** — call this out explicitly if your change touches that path.
- ffmpeg is required at runtime for analysis; don't assume it's present in code paths
  that can run without it.
- Engine fallback is deliberate and asymmetric: `chordino` **falls back** to librosa when
  the native plugin is missing; `btc` **must not** — a missing dep fails the recording
  rather than silently downgrading to a weaker engine. Don't "helpfully" add a fallback.

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
> keeps its old schema and the ORM fails on the new column. The remedy is to **delete the
> DB file and let it be recreated** (see *Schema changes: the data is disposable*) — not to
> write a migration. Note the distinction from rule 4 above: recreating a dev DB whose
> *schema* is stale is the intended workflow, but hand-editing *rows* to paper over a bug in
> the code is not a fix.

## Chord-accuracy work (Phase 0/1)

Changing a chord engine? **Measure it, don't eyeball it.** The harness scores predictions
against hand-corrected MIREX `.lab` ground truth in `tests/eval/` using `mir_eval`
(needs the `[ml]` extra):

    python scripts/eval_chords.py --dataset tests/eval --engine librosa --baseline chordino
    python scripts/bootstrap_labels.py path/to/clip.m4a --engine chordino  # starter .lab
    python scripts/separation_spike.py path/to/song.m4a --out-dir /tmp/stems

Report the per-clip **win rate** alongside the weighted mean — the eval set is small
enough that a single clip can swing the average. Record findings in
`docs/phase-0-findings.md`; the plan and gate live in `docs/technical-plan-phase-0-1.md`
and `docs/multi-instrument-roadmap.md`.

# Technical Plan — Phase 0 & 1 (Confirm the Thesis)

Scope: the first two phases of the [multi-instrument roadmap](./multi-instrument-roadmap.md).
The purpose of these two phases is to **confirm the thesis** — that *instrument
separation + a trained deep chord model* beats the current template matcher by a
meaningful, measured margin at an acceptable cost on our hardware — and then land the
**stem-aware backend substrate** everything else builds on.

Everything here is self-hosted (Demucs + PyTorch), web-only, no third-party API.

- **Phase 0** = spikes + evidence. Throwaway-friendly code, real measurements. Ends at a
  **go/no-go gate**.
- **Phase 1** = the durable `Stem` substrate in the app, still using the *existing*
  chord engine per stem. No deep model in production yet (that's Phase 2).

Out of scope here: making the deep model the default engine, per-instrument editable
chart UI, cross-platform clients, tabs, and any model training/fine-tuning.

---

## 0. Environment & hardware

Two machines, one codebase:

| Machine | Role | Torch backend |
|---------|------|---------------|
| RTX 5070 Ti (16 GB, Blackwell / `sm_120`) | inference / hosting | CUDA |
| Apple-silicon Mac (M-series) | development | MPS / CPU |

**Setup gotchas to verify first:**

- **Blackwell needs current wheels.** The 5070 Ti (`sm_120`) requires **PyTorch built
  against CUDA 12.8+ (`cu128` wheels)**. Older builds lack `sm_120` kernels and will
  error or fall back to CPU. First task on the GPU box: confirm
  `torch.cuda.is_available()` and a real matmul on-device.
- **Keep heavy deps optional.** Add an extra dependency group (e.g. `[ml]`) in
  `pyproject.toml` for `torch`, `demucs`, `mir_eval`. The base app must still install and
  run without them (same pattern already used for the optional `vamp`/Chordino engine).
- **Python 3.14 / `.venv`.** Use the project `.venv`; there is no bare `python` on PATH.
  Verify Demucs + the chosen chord model import under 3.14 early (dependency rot is a
  named risk below).
- **Device abstraction.** A single `TABIT_ANALYSIS_DEVICE` (`cuda` | `mps` | `cpu`)
  selects the backend so the same code runs on both machines.

---

## Phase 0 — De-risking spikes

### 0.1 Evaluation harness & ground-truth set (do this first)

Nothing else can be judged without it.

- **Dataset:** ~15–30 clips, ~20–40 s each, drawn from the material Tabit actually
  targets: solo guitar, solo piano, and a few small multi-instrument recordings. Include
  at least a couple of the messy practice-voice-memo cases.
- **Ground truth:** hand-label chord segments with times. Fastest path: run each clip
  through Tabit's existing chart editor, correct it by hand, and export **MIREX `.lab`**
  format (`start_sec  end_sec  label` per line). Store under `tests/eval/` with audio +
  `.lab` pairs.
- **Metrics:** use **`mir_eval.chord`** — weighted chord-symbol recall (WCSR) under the
  standard vocabularies (`majmin`, `majmin7`, `triads`, `thirds`). Report per-clip and
  aggregate.
- **Deliverable:** `scripts/eval_chords.py` — takes an engine + the dataset, aligns
  prediction vs reference via `mir_eval`, writes a CSV/markdown report. This script is
  reused in Phase 2 and beyond; it is the durable output of Phase 0.

### 0.2 Demucs separation spike

- Use `demucs.api.Separator(model="htdemucs_6s")` → 6 stems (vocals, drums, bass,
  guitar, piano, other).
- On the 5070 Ti, **measure per-song: wall-clock, peak VRAM, and real-time factor**.
  On the Mac, record MPS/CPU timings for the dev loop.
- Subjectively grade stem quality per instrument (expect **guitar OK, piano weak with
  bleed/artifacts** — do not block on piano).
- **Deliverable:** timing/VRAM table + a folder of separated stems for the eval set.

### 0.3 Deep chord model spike

- Target model: a **BTC-class bidirectional transformer** (PyTorch, pretrained weights),
  run for **inference only** in Phase 0.
- Run three conditions through `eval_chords.py` and compare on the same eval set:
  1. deep model on the **full mix**,
  2. deep model on the **isolated harmonic stem** (guitar/piano from 0.2),
  3. the current **`hmm-v3`** engine (baseline), and optionally `chordino-v1`.
- **Deliverable:** the A/B/C WCSR report. This is the evidence for the gate.

### 0.4 Job-queue / GPU-worker POC

- The in-process `JobDispatcher` (thread pool) won't hold Demucs-scale work. Prototype a
  real queue + a GPU worker that consumes a "separate + analyze" job.
- **Recommended:** **Arq** (async, Redis-backed, lightweight, fits FastAPI's async
  model) over Celery (heavier). Decide in this POC.
- **Deliverable:** a minimal worker that pulls a job, runs Demucs on the GPU, and writes
  results — proving the execution path end to end.

### Phase 0 exit — go/no-go gate

Proceed to Phase 1 only if, on the eval set:

- **Accuracy:** the deep model on the isolated stem beats `hmm-v3` on WCSR (`majmin`) by
  a **meaningful margin** (target: **≥ +8–10 absolute points**), and ideally shows the
  wider vocabulary is usable.
- **Cost/latency:** separation + analysis for a ~3-minute song completes within budget
  on the 5070 Ti (target: **well under real-time**, e.g. ≲ 20–30 s/song), within 16 GB
  VRAM.
- **Feasibility:** Demucs and the chord model both run under Python 3.14 with `cu128`
  torch.

If the margin isn't there, we stop and reconsider (e.g. different model, fine-tuning,
better stem handling) *before* building Phase 1 on the assumption.

---

## Phase 1 — Stem substrate in the app

Durable, tested, additive. Existing behavior (whole-recording analysis) keeps working;
stems are layered alongside.

### 1.1 Data model (`app/models.py` + `app/migrations.py`)

- **New `Stem`**: `id`, `recording_id` (FK), `instrument` (enum: vocals/drums/bass/
  guitar/piano/other), `stored_path`, `model_version` (e.g. `htdemucs_6s`), `created_at`.
  `Recording` **1:N `Stem`**.
- **`Analysis` and `ChordChart` gain a nullable `stem_id` FK.** `NULL` = the existing
  whole-mix analysis/chart (preserves all current rows and behavior); a set `stem_id` =
  per-instrument. The immutable-`Analysis` invariant is unchanged.
- **Migrations:** add every new column via `run_additive_migrations` in
  `app/migrations.py`. `create_all` adds missing *tables* but never *columns* on an
  existing SQLite DB — the documented gotcha. New tables (`stems`) are fine via
  `create_all`; the new FK columns on existing tables are not.

### 1.2 Separation pipeline stage

- New `SeparationService` wrapping `demucs.api`, honoring `TABIT_ANALYSIS_DEVICE`.
- Insert a **separation job stage** that runs before analysis, writes stem files via
  `app/storage.py`, and creates `Stem` rows. The queue (from 0.4) fans out one analysis
  task per stem.
- **The existing chord engine is reused per stem** — Phase 1 does not introduce the deep
  model into production. It proves the plumbing: recording → stems → per-stem chart.

### 1.3 Stem storage — recommendation

The open decision from the roadmap. Tradeoffs:

| Option | Disk | Re-access cost | Notes |
|--------|------|----------------|-------|
| **A. Persist stems (lossless FLAC)** | ~5–6× source per recording | cheap (read file) | Separation is the most expensive step; never recompute it for playback / re-analysis / future tabs |
| **B. Regenerate on demand** | minimal | expensive (re-run Demucs on GPU every time) | Slow, re-loads the GPU for every access |
| **C. Hybrid cache** | source + evictable stem cache | cheap on hit, expensive on miss | Best at scale; more moving parts |

**Recommendation for Phase 0–1: Option A — persist all stems as lossless FLAC** under
`TABIT_STORAGE_DIR`. During thesis confirmation we iterate analysis repeatedly and must
not pay re-separation each pass; iteration speed and correctness outweigh disk. Use
**FLAC, not MP3** — lossy compression artifacts degrade downstream chord (and future tab)
analysis. Revisit **Option C (eviction)** in Phase 2 / production when volume matters.
Add `TABIT_STEM_STORAGE` / `TABIT_STEM_FORMAT` config knobs so the policy is swappable
later without a schema change.

### 1.4 API & schemas

- New: `GET /api/recordings/{id}/stems` → list of stems with instrument + audio URL;
  extend audio serving to stream a stem.
- Update `app/schemas.py` (`StemOut`, and `stem_id`/`instrument` on analysis/chart
  shapes) **and** `frontend/src/api/types.ts` **together** (project rule).
- Minimal web UI only: list the separated stems for a recording and let the user play
  each. Per-instrument editable charts are **Phase 2**, not here.

### 1.5 Config (`app/config.py` + `README.md`)

New `TABIT_`-prefixed vars, documented:

- `TABIT_ENABLE_SEPARATION` (default off, so the base app is unchanged),
- `TABIT_SEPARATION_MODEL` (default `htdemucs_6s`),
- `TABIT_ANALYSIS_DEVICE` (`cuda` | `mps` | `cpu`),
- `TABIT_STEM_STORAGE` / `TABIT_STEM_FORMAT`.

### 1.6 Tests

- Unit: `Stem` model + the additive migration (assert the new columns exist on a
  pre-existing DB — the delete-schema gotcha class of bug).
- Service: separation stage against a short synthetic clip, or with the separator mocked
  where torch/Demucs isn't installed in CI — gated behind a marker exactly like the
  existing optional-Chordino tests, so `pytest` stays green without the ML extras.
- Regression: existing whole-recording analysis/chart tests still pass (stem_id `NULL`
  path unchanged).

### Phase 1 exit criteria

Upload → separated stems persisted and playable, per-stem `Stem`/`Analysis`/`ChordChart`
rows created on the queue/GPU path, existing whole-mix behavior untouched, `pytest`
green (with and without the `[ml]` extras), and `npm run build` type-checks the new API
fields.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Blackwell `cu128` torch wheels / Python 3.14 support | Verify `torch.cuda` + Demucs import as the very first task; pin known-good versions in the `[ml]` extra |
| BTC/pretrained repo dependency rot | Time-box the port; fall back to another maintained pretrained chord model, or use `chordino-v1` as the "trained" comparison if BTC won't run |
| `htdemucs_6s` piano stem is weak | Prioritize guitar/bass; treat piano as best-effort; don't gate the go/no-go on piano |
| Separation artifacts hurt recognition | Evaluate stem vs full mix in 0.3; the bass-stem-for-root reconciliation lands in Phase 2 |
| Eval set too small/biased to trust the gate | Cover the instruments/genres Tabit actually targets; expand if results are noisy |
| Disk growth from persisted stems | Accept in Phase 0–1 (FLAC); plan Option C eviction for Phase 2 |

---

## Deliverables checklist

Phase 0:

- [ ] `tests/eval/` ground-truth set (audio + `.lab`)
- [ ] `scripts/eval_chords.py` (mir_eval WCSR report)
- [ ] Demucs timing/VRAM table + separated stems
- [ ] Deep-chord A/B/C accuracy report
- [ ] Queue/GPU-worker POC + infra decision (Arq vs Celery)
- [ ] **Go/no-go writeup against the gate**

Phase 1:

- [ ] `Stem` model + additive migration
- [ ] `SeparationService` + separation job stage
- [ ] Stem storage (Option A, FLAC) + config knobs
- [ ] `GET /recordings/{id}/stems` + schemas/types + minimal stem UI
- [ ] Tests (model/migration/service/regression) + README/config docs

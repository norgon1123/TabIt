# Tabit Multi-Instrument Roadmap

**North star:** A self-hosted pipeline that separates a recording into instrument
stems, produces an editable chord chart per instrument (escaping template-matching),
available on the web first and later on iOS and Android — with per-instrument tabs as
the future payoff of the same separation substrate.

**Chosen direction (decided):**

- **Self-hosted, no third-party transcription API.** Separation via **Demucs**, chord
  recognition via a **PyTorch** deep model. No Klangio / no per-call cost.
- **Hosting:** self-hosted inference on an **NVIDIA RTX 5070 Ti** (16 GB, Blackwell).
  Development on an **Apple-silicon Mac (M-series)** via the MPS/CPU backends.
- **Web first.** The product ships and is validated on the web app *before* any mobile
  client work begins (cross-platform is Phase 3, strictly after Phase 2).

**Guiding principle:** Separation is the foundation layer. Everything — better chords
now, tabs later — is a consumer of stems. Build it once, build it well.

---

## Why this shape

Both current engines (`hmm-v3` template matching, `chordino-v1`) are heuristic systems
on top of lossy chroma features. Their accuracy ceiling is a *representation* problem,
not a tuning problem, so every fix is another hand-tuned constant — the "never-ending
battle of corrections." Two changes lift the ceiling:

1. **Instrument separation** removes the polyphonic interference that causes most chord
   errors (isolating the guitar makes its chords far cleaner). This is *also* the
   substrate future tabs require — every audio-to-tab pipeline starts by isolating the
   instrument.
2. **A trained deep chord model** replaces template matching, moving onto a higher
   accuracy curve that improves with data instead of with heuristics.

Multi-instrument support and "escape the correction battle" are therefore the same move.

---

## Phase 0 — Foundations & de-risking spikes

*Goal: prove the risky assumptions and stand up the infra before committing to the
build. No user-facing change.*

- **Build a ground-truth eval set.** ~15–30 real practice recordings with hand-verified
  chords (and instrument labels). This is the thing that ends the "endless corrections"
  feeling — you *measure* accuracy instead of eyeballing it. Foundational; everything
  downstream is scored against it.
- **Demucs spike.** Run `htdemucs_6s` on the eval set; assess guitar/bass/vocal stem
  quality (expect piano to be weak), and **measure runtime + VRAM + cost per song** on
  the 5070 Ti.
- **Deep-chord spike.** Stand up a BTC-class PyTorch model; compare its accuracy on
  (a) full mix vs (b) isolated stem vs (c) the current `hmm-v3`, on the eval set. This
  is the go/no-go evidence that separation + a trained model beats what we have.
- **Infra decision.** Choose the GPU execution path and a real job queue to replace the
  in-process `JobDispatcher`.

**Exit criteria:** Measured proof that "separated stem + deep model" beats current
accuracy on the eval set, at an acceptable per-song cost/latency on the 5070 Ti, plus a
chosen infra path. → **Go/no-go gate for the whole program.**

---

## Phase 1 — Separation as a first-class backend concept

*Goal: stems exist in the product. Substrate for everything after.*

- Data model: `Recording` **1:N `Stem`** (instrument type + stored separated audio);
  `Analysis` / `ChordChart` become per-stem. The immutable-`Analysis` invariant carries
  over. No migrations needed yet — the dev DB is disposable, so drop and recreate it and
  let `create_all` build the new schema (revisit `app/migrations.py` before first real
  deployment).
- Pipeline: Demucs separation becomes a job stage; the queue fans out per-stem work.
- Decide stem **storage strategy** (persist vs regenerate on demand — cost/latency
  tradeoff; see the Phase 0–1 technical plan).
- Chord recognition still uses the *existing* engine here — this phase is about the
  stem-aware architecture, not yet the new model.

**Exit criteria:** Upload → separated stems, playable/inspectable, per-stem records in
the DB, running on the new queue/GPU path.

---

## Phase 2 — Deep chord model + per-instrument charts  ⭐ core payoff

*Goal: the reliability jump + multi-instrument charts the original ask wanted.*

- Replace the template matcher with the trained deep chord model (server-side PyTorch),
  run **per harmonic stem**.
- Use the **bass stem for root** and reconcile with the mix for quality (the
  artifact-safe pattern — separated-audio artifacts can otherwise hurt recognition).
- **Widen the vocabulary** beyond the current 5 qualities; keep a simplified display
  mode if desired.
- Per-instrument editable charts **+ a combined/full-mix chart**; extend the
  chart/segment UI to switch instruments.

**Exit criteria:** Measurable accuracy gain over `hmm-v3` on the eval set; per-instrument
charts, each editable. This phase alone delivers the "sophisticated + reliable, no more
heuristic battle" goal — on the **web app**.

---

## Phase 3 — Cross-platform client (Expo)

*Goal: iOS + Android + web from one codebase. Strictly after Phase 2 — the product is
validated on the web app first.*

- Add **bearer-token auth** alongside the existing cookie (native apps can't use the
  httpOnly same-origin session cookie).
- Migrate the frontend to **Expo (React Native + react-native-web)**, reusing the
  React/TS/TanStack Query stack; the web target stays close to today's SPA.
- Abstract audio playback + chart rendering behind a platform-agnostic layer (Expo AV).
- App-store presence + OTA update path.

**Exit criteria:** The same feature set shipping on iOS, Android, and web from one
codebase.

---

## Phase 4 — Per-instrument tabs (future)

*Goal: cash in the separation substrate. Research-grade — scope as exploration, not a
committed date.*

- Per-stem note transcription (Basic Pitch / instrument AMT) on already-isolated stems.
- Guitar **string/fret assignment** (SynthTab / TART-style) → editable tab; bass tabs
  and drum notation as extensions.

**Exit criteria (spike-level):** A guitar stem → plausible editable tab on clean
recordings. Decide build-deeper vs defer based on results.

---

## Sequencing at a glance

| Phase | Depends on | Ships to users? |
|-------|-----------|-----------------|
| 0 Foundations / spikes | — | No (internal) |
| 1 Stems substrate | 0 (go) | Stems visible |
| 2 Deep chords ⭐ | 1 | **Core value (web)** |
| 3 Cross-platform | 2 | All 3 platforms |
| 4 Tabs (future) | 1, ideally 2 | Tabs |

**Critical path:** 0 → 1 → 2 → 3. Web-first: Phase 3 begins only once the product is
proven on the web app in Phase 2. Phase 4 forks off after stems exist (Phase 1) and
ideally after the deep model (Phase 2).

---

## Cross-cutting concerns (apply to every phase)

- **Eval-driven:** every model/pipeline change is scored against the Phase 0 eval set.
  This discipline replaces endless manual correction.
- **Cost/latency budget:** GPU time and time-to-result are first-class metrics from
  Phase 0 on, measured on the 5070 Ti.
- **Invariants carry per-stem:** immutable `Analysis`; chart length ≤ recording
  duration; re-analysis overwrites edits (now per stem — surface this in the UI).
- **Pretrained first, training later:** start from pretrained deep-chord weights;
  fine-tuning/retraining on our own data is an optional later lever, not a Phase 2
  blocker.
- **Schema discipline:** new API fields update `app/schemas.py` *and*
  `frontend/src/api/types.ts` together. The dev DB is disposable for now (drop/recreate,
  no migrations); the `app/migrations.py` path returns once there is data to preserve.

---

## Settled decisions

1. **GPU hosting:** self-hosted on an RTX 5070 Ti (16 GB) to start; dev on an
   Apple-silicon Mac. Revisit scaling (second GPU / serverless burst) only if throughput
   demands it.
2. **Cross-platform timing:** after Phase 2. Web-first — validate the product on the web
   app before building mobile clients.
3. **Stem storage:** open — tradeoffs and a recommendation are in the Phase 0–1 technical
   plan (`docs/technical-plan-phase-0-1.md`).

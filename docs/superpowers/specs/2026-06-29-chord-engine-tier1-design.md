# Chord Engine Tier 1 — Robust Pure-Python Recognition

**Date:** 2026-06-29
**Status:** Approved
**Scope:** Improve chord-analysis accuracy on playing mistakes, chord extensions, and
imperfect (home/voice-memo) recordings — without new runtime dependencies and without
changing the stored chord vocabulary, DB schema, API, or frontend.

## Motivation

The current engine (`template-v2`) is `librosa.feature.chroma_cqt` → per-frame cosine
template matching against 5 chord qualities (`maj, min, dom7, maj7, min7`), with
majority-vote smoothing. Three structural weaknesses:

| Requirement | Root cause today | Tier 1 lever |
|---|---|---|
| Imperfect recordings | `chroma_cqt` does no percussion/overtone removal | HPSS harmonic chroma |
| Playing mistakes | Per-frame labels are independent — one wrong note flips the label | Viterbi temporal decoder |
| Extensions (Cadd9 → C) | 5 hard templates; extension energy corrupts the cosine score | Extension-tolerant templates that reduce to the 5 output qualities |

Research finding driving the longer roadmap: NNLS chroma (overtone removal) outperforms
both librosa CQT chroma and Essentia HPCP (~9% over HPCP). NNLS/Chordino is a **native
Vamp-plugin** dependency, so it is deferred to Tier 2. Tier 1 captures the
architecturally-cheap wins in pure Python first, and de-risks by proving the temporal
model and front-end help on real recordings.

## Decisions (locked)

- **Output vocabulary unchanged.** Extensions are recognized internally but emitted as
  one of the existing 5 `Quality` values (e.g. `Cadd9 → C maj`). No DB/API/frontend churn.
- **Viterbi/HMM decoder** replaces majority-vote smoothing as the mistake-handling lever.

## Architecture

All changes sit behind the existing `Analyzer` and `ChordRecognizer` Protocols. Pipeline:

```
decode → HPSS(harmonic) → chroma → recognizer.score() → Viterbi decode
       → merge_segments → drop_short_segments → shift_segments → segments
```

`ENGINE_VERSION` bumps `template-v2` → `hmm-v3`.

### 1. Front-end chroma (`app/audio/analyzer.py`)

Extract a `_chroma_features(y, sr)` helper. It runs `librosa.effects.hpss` and computes
chroma on the **harmonic** component, suppressing percussion, pick noise, and string
squeaks that pollute the 12 bins. HPSS is toggleable via config so we can A/B it.
The helper isolates the front-end so Tier 2 can swap in a different chroma source.

### 2. Extension-tolerant recognizer (`app/audio/recognizer.py`)

Expand the **internal** template bank beyond the 5 output qualities to include
`sus2, sus4, 6, min6, dim, aug, add9, dom9, maj9, min9`. Each internal template carries
an **output label drawn from the existing 5 qualities** via a fixed reduction map:

| Internal template | Pitch offsets | Output Quality |
|---|---|---|
| maj | 0,4,7 | maj |
| min | 0,3,7 | min |
| dom7 | 0,4,7,10 | dom7 |
| maj7 | 0,4,7,11 | maj7 |
| min7 | 0,3,7,10 | min7 |
| sus2 | 0,2,7 | maj |
| sus4 | 0,5,7 | maj |
| 6 | 0,4,7,9 | maj |
| add9 | 0,4,7,2 | maj |
| maj9 | 0,4,7,11,2 | maj7 |
| dom9 | 0,4,7,10,2 | dom7 |
| min6 | 0,3,7,9 | min |
| min9 | 0,3,7,10,2 | min7 |
| dim | 0,3,6 | min |
| aug | 0,4,8 | maj |

Rationale for the ambiguous reductions: `dim → min` (shared minor third) and `aug → maj`
(shared major third) keep the root and the defining third, which is what a chart needs;
power/no-chord cases are out of Tier 1 scope.

New method `score(chroma) -> (labels, score_matrix)`:
- `labels`: the ordered list of `(root_pc, output_quality)` states, length `S`.
  Multiple internal templates can share a state; per frame we keep the **max** cosine
  over the internal templates reducing to that state, so extension energy lifts the
  correct base state instead of a wrong neighbour.
- `score_matrix`: `S × N` per-frame cosine scores (the emissions for Viterbi).

`recognize(chroma)` stays as the argmax-over-states convenience wrapper, preserving the
existing 7 recognizer tests and the silent-frame / non-12-row behaviour.

### 3. Viterbi temporal decoder (`app/audio/decoding.py`, new)

`viterbi_decode(score_matrix, labels, change_penalty) -> list[(root_pc, quality)]`.
Treats each column's scores as emissions and applies a transition cost: staying on the
same state is free; switching states costs `change_penalty`. Standard log-space Viterbi
returns the single most-likely state path. A handful of wrong frames can no longer flip
the label, while a genuinely sustained change still overcomes the penalty. Output replaces
`smooth_labels` and feeds the existing `merge_segments → drop_short_segments →
shift_segments` chain untouched.

### 4. Config (`app/config.py`)

Two env-overridable tunables, matching the existing `analysis_*` pattern:
- `analysis_change_penalty: float` — Viterbi self-stay bias.
- `analysis_use_hpss: bool` — toggle harmonic separation.

## Error handling

- Empty decoded audio: existing `RuntimeError` guard unchanged.
- Silent / zero-norm frames: contribute uniform (near-zero) emissions; Viterbi holds the
  prior state through them, matching today's "hold previous chord" behaviour.
- `score()` rejects non-12-row chroma (same `ValueError` as `recognize`).

## Testing (TDD; unit layers need no ffmpeg/native deps)

- **Recognizer:** synthetic `Cadd9`, `sus4`, `6`, `dim`, `aug` chroma columns emit the
  mapped base quality; existing 7 recognizer tests stay green; `score()` returns an
  `S × N` matrix with the expected argmax.
- **Decoder:** a state sequence with 1–2 injected wrong frames is corrected; a real
  sustained change is preserved; `change_penalty=0` reduces to plain argmax.
- **Analyzer:** existing synthetic two-chord integration test (skips without ffmpeg);
  update the stale `engine_version` assertion (`template-v1` → `hmm-v3`).

## Tier 2 seam (deferred — needs a machine with the Vamp Plugin Pack)

A `ChordinoRecognizer` implementing the same `score()` / `recognize()` Protocol, mapping
Chordino's rich label set down to the 5 output qualities. It drops in behind
`LibrosaAnalyzer` (or a thin Chordino analyzer) with no changes to the decoder or segment
post-processing. Native install and on-recording evaluation happen in the developer's
environment, not CI.

## Known limitation of the librosa engine (investigated 2026-06-29)

On a real test recording (`audio/Simple I V IV I.m4a`, a G–D–C–G progression), the
librosa `hmm-v3` engine misreads the opening **G as D** (and mislabels the silent intro
as C#min7). Investigation found the cause is intrinsic: the opening chroma is *muddy* —
every pitch class carries 0.7–1.0 energy, so G(1.00) and D(0.98) are near-tied and the
plain-triad cosine scores collapse (Gmaj ≈ Dmaj ≈ 0.654), while higher-cardinality
extended templates spuriously win individual frames. Per-frame contrast/whitening
transforms (mean/median subtraction, power scaling) and a bass-register chroma all failed
to recover the root without introducing new errors — the bass chroma showed G even during
the D chord. The principled fix is NNLS note-salience chroma plus a trained decoder, which
*is* Chordino. Rather than reimplement Chordino inside the fallback engine, **Chordino is
now the default** (`analysis_engine="chordino"`, graceful fallback to librosa when the Vamp
plugin is absent), and it reads this file correctly as G–D–C–G with the intro trimmed.

## Out of scope (Tier 1)

- Expanding the stored `Quality` vocabulary (its own future phase).
- Source separation (Demucs) preprocessing.
- Any DB/schema/API/frontend change.

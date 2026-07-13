# Phase 0 — Findings Log

Running record of measured evidence for the [Phase 0 go/no-go gate](./technical-plan-phase-0-1.md#phase-0-exit--gono-go-gate).
Updated as spikes complete. Covers the **ML environment feasibility gate**, the **Demucs
separation cost/latency spike (0.2)**, and the **0.1 chord-accuracy baseline** (librosa vs
chordino on the ground-truth eval set). The **deep BTC model (0.3)** — the engine the gate
actually turns on — is still pending, so the go/no-go decision is not yet made.

## Environment (5070 Ti inference box)

Resolved the un-swappable ML stack on the GPU box. The technical plan predicted a
Python/CUDA-wheel fight; the actual resolution:

| Component | Pinned | Notes |
|-----------|--------|-------|
| Python | **3.14.6** | cp314 wheels ship for the whole stack — the plan's ≈3.12 recommendation was conservative, not required. |
| torch | **2.11.0+cu130** | From `download.pytorch.org/whl/cu130`. Blackwell / `sm_120` works; `torch.cuda.is_available()` + on-device matmul verified on the RTX 5070 Ti. |
| torchaudio | **2.11.0+cu130** | **Matched pair with torch.** The originally-installed `torch 2.12.1+cu130` had *no* compatible torchaudio (cu130 index tops out at 2.11.0), so torch was pinned back one minor to get a matched pair. |
| demucs | **4.0.1** (PyPI) | See "demucs.api" gotcha below. |
| mir_eval | **0.8.2** (PyPI) | Eval scoring. |
| soundfile | **0.14.0** (PyPI) | Stem file I/O — see "torchaudio I/O" gotcha below. |

**Install recipe** (also in `pyproject.toml` `[ml]` comment):

```bash
pip install --index-url https://download.pytorch.org/whl/cu130 "torch==2.11.0" "torchaudio==2.11.0"
pip install -e ".[ml]"   # demucs + mir_eval + soundfile from PyPI (torch already satisfied)
```

### Gotchas found & fixed

- **`demucs.api` is not in the released wheel.** `demucs.api.Separator` (the interface the
  scaffolding was written against) lives only on demucs git `main`; PyPI `demucs==4.0.1`
  lacks it. `SeparationService` was rewritten to drive the **stable released API**
  (`pretrained.get_model` + `apply.apply_model`), replicating the CLI's
  standardize-then-restore normalization. This keeps the `[ml]` extra installable from a
  released wheel and avoids the git-dependency repo-rot risk the plan flags.
- **torchaudio 2.11 removed native file I/O.** `torchaudio.save` (and thus
  `demucs.save_audio`) now delegates to an optional `torchcodec` package. Stems are written
  with **`soundfile`/libsndfile** (native FLAC) instead — added to the `[ml]` extra.
- **torchvision mismatch warning.** The box has `torchvision 0.27.1` (wants torch 2.12.1);
  harmless — Demucs doesn't use torchvision. Reinstall a matching torchvision only if
  something else needs it.

## 0.2 Demucs separation spike — cost/latency

`htdemucs_6s` on the RTX 5070 Ti (CUDA), `shifts=1`, `overlap=0.25`. Six stems confirmed:
**drums, bass, other, vocals, guitar, piano** @ 44.1 kHz stereo; written as 24-bit FLAC.

| Input length | Wall-clock | RTF | Peak VRAM | 3-min extrapolation |
|--------------|-----------|-----|-----------|---------------------|
| 8 s  | 0.84 s | 0.104× | 0.83 GB | ~19 s |
| 30 s | 1.42 s | 0.047× | 0.86 GB | ~9 s |
| 60 s | 0.92 s | 0.015× | 0.95 GB | ~3 s |

- **Peak VRAM is ~1 GB and flat across duration** — Demucs splits internally, so memory is
  set by segment size, not song length. Comfortably inside the 16 GB budget, leaving ample
  headroom to co-locate the chord model.
- **RTF is 1-2 orders of magnitude under real-time**, far under the ≲20-30 s/song target.
  (Longer clips show lower RTF as fixed model-load/warmup amortizes.)
- **Caveat:** measured on synthetic tones. Separation compute and VRAM are
  content-independent (fixed by model size × length), so the timing/VRAM conclusion holds
  for real music; **stem *quality* still needs the real eval set** to grade (expect
  guitar OK, piano weak — not a gate blocker per the plan).

### Gate status

| Gate dimension | Status |
|----------------|--------|
| **Feasibility** — Demucs imports & runs on the 5070 Ti under the pinned stack | ✅ **PASS** (measured above) |
| **Cost/latency** — separation well under real-time within 16 GB | ✅ **PASS** (separation only; add chord-model latency once 0.3 lands) |
| **Accuracy** — deep model on isolated stem beats `hmm-v3` by ≥+8-10 WCSR pts | ⏳ **Baseline set** (chordino below); still needs the BTC chord-model port (0.3) |

## 0.1 Chord accuracy baseline — eval set

Ground-truth eval set built: **10 clips** (~4 min total) covering solo/backing guitar,
blues, waltz, and known progressions, each with a hand-corrected MIREX `.lab` under
`tests/eval/`. Scored with `mir_eval.chord` WCSR via `scripts/eval_chords.py`. This
establishes the **baseline the deep model must beat** — it is *not* the gate itself
(that's deep-on-stem vs chordino, in 0.3).

| Engine | WCSR majmin (weighted mean) | Notes |
|--------|-----------------------------|-------|
| `librosa` (Tier 1 heuristic) | **0.446** | template chroma matching; weak, as expected — not a gate engine |
| `chordino` (Tier 2, `nnls-chroma:chordino`) | **0.776** | NNLS chroma + trained HMM/Viterbi; **the bar to beat** |

Chordino wins **8/10 clips** (Δ +0.330 majmin over librosa). Per-clip ranged from static
vamps where chordino is near-perfect (`D backing`, single Dm7) to the harder `A backing`
(Bm/A/C#m) where both engines struggle.

- **Reproduce:** `python scripts/eval_chords.py --dataset tests/eval --engine librosa --baseline chordino`
- **Caveat — mild pro-chordino bias.** 8 of the 10 `.lab` files were bootstrapped from
  chordino and hand-corrected, so the ground-truth *boundaries* started from chordino's
  segmentation, giving it a small home-field edge on overlap-weighted scores. It doesn't
  distort the 0.3 gate (deep vs chordino are scored against the *same* truth), but chordino's
  0.776 is a slightly optimistic absolute number.
- **Chordino requires the native nnls-chroma Vamp plugin** (Vamp Plugin Pack → `~/vamp/`)
  plus `pip install --no-build-isolation "vamp>=1.1"`. See `pyproject.toml` `[chordino]`.
- **Label hygiene:** `scripts/validate_labels.py` checks every `.lab` parses and has no
  overlapping/backwards intervals before scoring (hand-editing typos otherwise crash the
  run deep inside `mir_eval`).

## Still open (blocked on inputs, not the environment)

- **0.1 ground-truth set** — ✅ **done** (10 hand-labeled `.lab` pairs under `tests/eval/`;
  librosa/chordino baseline above). Expand the set only if the 0.3 margin comes back noisy.
- **0.3 deep chord model** — `BTCChordEngine` is still a stub. The environment is now
  ready; remaining work is vendoring the BTC inference code + staging pretrained weights on
  this box, then running the A/B/C WCSR comparison on the eval set. Deliberately **not**
  fabricated from memory — a subtly-wrong transformer would invalidate the go/no-go.
- **0.4 queue/GPU-worker POC** — no Redis on the box yet; Arq (recommended over Celery)
  needs Redis provisioned before the worker POC can run. Independent of the feasibility gate.
- **Go/no-go writeup** — waits on the 0.3 accuracy numbers.

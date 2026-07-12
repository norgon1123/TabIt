#!/usr/bin/env python
"""Build a stem dataset for the deep-model stem condition (Phase 0, spike 0.3 / T5).

The chord eval scores engines against a folder of ``audio + .lab`` pairs. To test the deep
model on the *isolated harmonic stem* (gate condition 2) we need a parallel dataset where
each clip's audio is a chosen stem combination instead of the full mix. This runs Demucs
(``SeparationService``) over every clip in the source set and writes ``<clip>.<fmt>`` plus a
copy of ``<clip>.lab`` into the output folder, so:

    python scripts/make_eval_stems.py --stem harmonic --out tests/eval-stems
    python scripts/eval_chords.py --dataset tests/eval-stems --engine deep --baseline chordino

*Which* stem best feeds the model is part of the spike — ``--stem`` takes a preset or an
explicit comma-separated source list. Needs the ``[ml]`` extra (Demucs) on the GPU box.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.audio.separation import (  # noqa: E402
    STEM_PRESETS,
    SeparationService,
    resolve_stem_sources,
    write_audio,
)

AUDIO_EXTS = (".wav", ".flac", ".m4a", ".mp3", ".ogg", ".aif", ".aiff")


def _find_pairs(dataset: Path) -> list[tuple[str, Path, Path]]:
    pairs: list[tuple[str, Path, Path]] = []
    for lab in sorted(dataset.glob("*.lab")):
        audio = next(
            (lab.with_suffix(ext) for ext in AUDIO_EXTS if lab.with_suffix(ext).exists()),
            None,
        )
        if audio is None:
            print(f"! skipping {lab.name}: no sibling audio", file=sys.stderr)
            continue
        pairs.append((lab.stem, audio, lab))
    return pairs


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dataset", default="tests/eval", help="source audio + .lab pairs")
    ap.add_argument("--out", default="tests/eval-stems", help="output stem dataset")
    ap.add_argument(
        "--stem",
        default="harmonic",
        help=f"preset ({sorted(STEM_PRESETS)}) or comma-separated sources, e.g. 'guitar,piano'",
    )
    ap.add_argument("--fmt", default="flac", help="output audio format (default flac)")
    ap.add_argument("--device", default="auto", help="auto | cuda | mps | cpu")
    args = ap.parse_args(argv)

    dataset, out = Path(args.dataset), Path(args.out)
    pairs = _find_pairs(dataset)
    if not pairs:
        raise SystemExit(f"no audio+.lab pairs found under {dataset}/")

    service = SeparationService(device=args.device)
    out.mkdir(parents=True, exist_ok=True)
    sources: list[str] | None = None

    for i, (name, audio, lab) in enumerate(pairs, start=1):
        result = service.separate(str(audio))
        if sources is None:
            try:
                sources = resolve_stem_sources(args.stem, list(result.stems))
            except ValueError as exc:
                raise SystemExit(str(exc)) from exc
            print(f"stem = {args.stem} -> summing {sources}")
        mix = sum(result.stems[s] for s in sources)  # (channels, samples) tensors
        stem_path = out / f"{name}.{args.fmt}"
        write_audio(str(stem_path), mix, result.samplerate, args.fmt)
        shutil.copyfile(lab, out / f"{name}.lab")
        print(f"[{i}/{len(pairs)}] {name}: wrote {stem_path.name} + {name}.lab")

    print(f"\nstem dataset ready at {out}/ ({len(pairs)} clips). Score with:")
    print(f"  python scripts/eval_chords.py --dataset {out} --engine deep --baseline chordino")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

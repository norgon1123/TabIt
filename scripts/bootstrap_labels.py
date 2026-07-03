#!/usr/bin/env python
"""Generate a starter ``.lab`` from an engine, to hand-correct into ground truth (0.1).

The eval set needs *verified* chord labels, but typing them from scratch is slow. This
runs an existing engine over a clip and writes its prediction as a ``.lab`` next to the
audio; you then open it (or the clip in Tabit's editor) and fix the wrong chords. The
corrected file is the ground truth the harness scores against — so do not trust the raw
output, correct it.

    python scripts/bootstrap_labels.py clip.m4a --engine chordino
    # writes clip.lab
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.audio.labels import segments_to_lab, write_lab  # noqa: E402


def _engine(name: str):
    if name == "librosa":
        from app.audio.analyzer import LibrosaAnalyzer

        return LibrosaAnalyzer().analyze
    if name == "chordino":
        from app.audio.analyzer import ChordinoAnalyzer

        return ChordinoAnalyzer().analyze
    raise SystemExit(f"unknown engine {name!r}; choose librosa|chordino")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("audio", help="audio file to label")
    ap.add_argument("--engine", default="chordino", help="librosa | chordino")
    ap.add_argument("--out", default=None, help="output .lab (default: alongside audio)")
    args = ap.parse_args(argv)

    result = _engine(args.engine)(args.audio)
    intervals, labels = segments_to_lab(result.segments, span_end=result.duration)
    out = Path(args.out) if args.out else Path(args.audio).with_suffix(".lab")
    write_lab(str(out), intervals, labels)
    print(f"wrote {out} ({len(labels)} segments) — CORRECT IT before using as ground truth")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

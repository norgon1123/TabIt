#!/usr/bin/env python
"""Score a chord engine against a ground-truth eval set (Phase 0, spike 0.1).

The durable output of Phase 0. Runs an engine over a folder of ``audio + .lab`` pairs,
scores each clip with ``mir_eval`` across the MIREX vocabularies, and writes a
markdown (and optional CSV) report. Pass ``--baseline`` to also report per-clip win rate
vs another engine — the guard that stops one or two easy clips from carrying the go/no-go
decision on a small eval set.

    python scripts/eval_chords.py --dataset tests/eval --engine librosa \
        --baseline chordino --out eval-report.md --csv eval-scores.csv

Engines: ``librosa`` (hmm-v3), ``chordino`` (chordino-v1), ``deep`` (BTC-class; not wired
up yet — see app/audio/deep_chord.py). Requires the ``[ml]`` extra for mir_eval; the
``chordino``/``deep`` engines need their own deps too.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

# Allow running as a plain script (python scripts/eval_chords.py) without PYTHONPATH.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.audio.chord_eval import (  # noqa: E402
    DEFAULT_VOCABS,
    ClipScore,
    aggregate,
    clip_duration,
    score_labels,
    win_rate,
)
from app.audio.labels import read_lab, segments_to_lab  # noqa: E402
from app.audio.segments import DetectedSegment  # noqa: E402

AUDIO_EXTS = (".wav", ".flac", ".m4a", ".mp3", ".ogg", ".aif", ".aiff")


def _make_engine(name: str):
    """Return a callable audio_path -> list[DetectedSegment] (engines imported lazily)."""
    if name == "librosa":
        from app.audio.analyzer import LibrosaAnalyzer

        analyzer = LibrosaAnalyzer()
        return lambda p: analyzer.analyze(p).segments
    if name == "chordino":
        from app.audio.analyzer import ChordinoAnalyzer

        analyzer = ChordinoAnalyzer()
        return lambda p: analyzer.analyze(p).segments
    if name == "deep":
        from app.audio.deep_chord import BTCChordEngine

        engine = BTCChordEngine()
        return engine.segments
    raise SystemExit(f"unknown engine {name!r}; choose librosa|chordino|deep")


def _find_pairs(dataset: Path) -> list[tuple[str, Path, Path]]:
    """Discover (name, audio_path, lab_path) triples: each .lab with a sibling audio."""
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


def _score_engine(name: str, pairs: list[tuple[str, Path, Path]]) -> list[ClipScore]:
    engine = _make_engine(name)
    clips: list[ClipScore] = []
    for clip_name, audio, lab in pairs:
        ref_i, ref_l = read_lab(str(lab))
        span_end = max((e for _, e in ref_i), default=0.0)
        try:
            segments: list[DetectedSegment] = engine(str(audio))
        except Exception as exc:  # noqa: BLE001 - report per-clip, keep going
            print(f"! {name} failed on {clip_name}: {exc}", file=sys.stderr)
            clips.append(ClipScore(clip_name, clip_duration(ref_i), {}))
            continue
        est_i, est_l = segments_to_lab(segments, span_end=span_end)
        scores = score_labels(ref_i, ref_l, est_i, est_l)
        clips.append(ClipScore(clip_name, clip_duration(ref_i), scores))
    return clips


def _markdown(name: str, clips: list[ClipScore], baseline: tuple[str, list[ClipScore]] | None) -> str:
    vocabs = DEFAULT_VOCABS
    lines = [f"# Chord eval — `{name}`", ""]
    header = "| clip | dur (s) | " + " | ".join(vocabs) + " |"
    sep = "|" + "---|" * (len(vocabs) + 2)
    lines += [header, sep]
    for c in clips:
        cells = " | ".join(f"{c.scores.get(v, 0.0):.3f}" for v in vocabs)
        lines.append(f"| {c.name} | {c.duration:.1f} | {cells} |")
    agg = aggregate(clips, vocabs)
    lines.append("| **weighted mean** | | " + " | ".join(f"**{agg[v]:.3f}**" for v in vocabs) + " |")
    lines.append("")
    if baseline is not None:
        base_name, base_clips = baseline
        rate, deltas = win_rate(clips, base_clips, metric="majmin")
        base_agg = aggregate(base_clips, vocabs)
        lines += [
            f"## vs baseline `{base_name}` (majmin)",
            "",
            f"- weighted-mean majmin: **{agg.get('majmin', 0.0):.3f}** "
            f"vs {base_agg.get('majmin', 0.0):.3f} "
            f"(Δ {agg.get('majmin', 0.0) - base_agg.get('majmin', 0.0):+.3f})",
            f"- per-clip win rate: **{rate:.0%}** ({sum(1 for _, d in deltas if d > 1e-9)}/{len(deltas)} clips)",
            "",
            "| clip | Δ majmin |",
            "|---|---|",
        ]
        for cn, d in deltas:
            lines.append(f"| {cn} | {d:+.3f} |")
        lines.append("")
    return "\n".join(lines)


def _write_csv(path: Path, name: str, clips: list[ClipScore]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["engine", "clip", "duration", *DEFAULT_VOCABS])
        for c in clips:
            writer.writerow([name, c.name, f"{c.duration:.3f}", *[f"{c.scores.get(v, 0.0):.4f}" for v in DEFAULT_VOCABS]])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dataset", default="tests/eval", help="folder of audio + .lab pairs")
    ap.add_argument("--engine", required=True, help="librosa | chordino | deep")
    ap.add_argument("--baseline", default=None, help="optional engine to compare against")
    ap.add_argument("--out", default=None, help="markdown report path (default: stdout)")
    ap.add_argument("--csv", default=None, help="optional per-clip CSV path")
    args = ap.parse_args(argv)

    dataset = Path(args.dataset)
    pairs = _find_pairs(dataset)
    if not pairs:
        raise SystemExit(f"no audio+.lab pairs found under {dataset}/")

    clips = _score_engine(args.engine, pairs)
    baseline = (args.baseline, _score_engine(args.baseline, pairs)) if args.baseline else None

    report = _markdown(args.engine, clips, baseline)
    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(report)
    if args.csv:
        _write_csv(Path(args.csv), args.engine, clips)
        print(f"wrote {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

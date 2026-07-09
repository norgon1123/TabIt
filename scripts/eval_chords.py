#!/usr/bin/env python
"""Score a chord engine against a ground-truth eval set (Phase 0, spike 0.1).

The durable output of Phase 0. Runs one or more engines over a folder of ``audio + .lab``
pairs, scores each clip with ``mir_eval`` across the MIREX vocabularies, and writes a
markdown (and optional CSV) report. Against a ``--baseline`` it reports the guards that stop
one or two easy clips from carrying the go/no-go decision on a small eval set: per-clip win
rate **and** a bootstrap CI on the duration-weighted majmin delta, with a PASS verdict only
when the CI's lower bound clears ``--gate-margin``.

    # single engine vs baseline (spike 0.1)
    python scripts/eval_chords.py --dataset tests/eval --engine librosa --baseline chordino

    # A/B/C gate report (spike 0.3): deep on stem vs deep on mix vs chordino
    python scripts/eval_chords.py --dataset tests/eval-stems \
        --engines deep,chordino --baseline chordino --out gate-report.md

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
    bootstrap_delta_ci,
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


def _gate_block(
    name: str,
    clips: list[ClipScore],
    base_name: str,
    base_clips: list[ClipScore],
    *,
    bootstrap: int,
    seed: int,
    gate_margin: float,
) -> list[str]:
    """Render the ``name`` vs ``base_name`` majmin comparison + small-eval-set guards.

    The gate turns on this block: the duration-weighted Δ, per-clip win rate, and a
    bootstrap CI. The verdict only reads PASS when the CI's lower bound clears
    ``gate_margin`` *and* the win rate is a majority — so one or two easy clips can't carry
    the decision.
    """
    agg = aggregate(clips, DEFAULT_VOCABS).get("majmin", 0.0)
    base_agg = aggregate(base_clips, DEFAULT_VOCABS).get("majmin", 0.0)
    rate, deltas = win_rate(clips, base_clips, metric="majmin")
    ci = bootstrap_delta_ci(clips, base_clips, "majmin", n_resamples=bootstrap, seed=seed)
    passes = ci.lo >= gate_margin and rate > 0.5
    verdict = "✅ PASS" if passes else "❌ not met"
    wins = sum(1 for _, d in deltas if d > 1e-9)
    lines = [
        f"## `{name}` vs `{base_name}` (majmin)",
        "",
        f"- weighted-mean majmin: **{agg:.3f}** vs {base_agg:.3f} (Δ **{agg - base_agg:+.3f}**)",
        f"- per-clip win rate: **{rate:.0%}** ({wins}/{len(deltas)} clips)",
        f"- bootstrap {ci.level:.0%} CI on Δ: **[{ci.lo:+.3f}, {ci.hi:+.3f}]** "
        f"({bootstrap} resamples, seed {seed})",
        f"- gate (Δ CI-lower ≥ {gate_margin:+.2f} **and** win rate > 50%): {verdict}",
        "",
        "| clip | Δ majmin |",
        "|---|---|",
    ]
    lines += [f"| {cn} | {d:+.3f} |" for cn, d in deltas]
    lines.append("")
    return lines


def _score_table(clips: list[ClipScore]) -> list[str]:
    vocabs = DEFAULT_VOCABS
    header = "| clip | dur (s) | " + " | ".join(vocabs) + " |"
    sep = "|" + "---|" * (len(vocabs) + 2)
    lines = [header, sep]
    for c in clips:
        cells = " | ".join(f"{c.scores.get(v, 0.0):.3f}" for v in vocabs)
        lines.append(f"| {c.name} | {c.duration:.1f} | {cells} |")
    agg = aggregate(clips, vocabs)
    lines.append("| **weighted mean** | | " + " | ".join(f"**{agg[v]:.3f}**" for v in vocabs) + " |")
    lines.append("")
    return lines


def _markdown(
    name: str,
    clips: list[ClipScore],
    baseline: tuple[str, list[ClipScore]] | None,
    *,
    bootstrap: int = 2000,
    seed: int = 0,
    gate_margin: float = 0.08,
) -> str:
    lines = [f"# Chord eval — `{name}`", ""]
    lines += _score_table(clips)
    if baseline is not None:
        base_name, base_clips = baseline
        lines += _gate_block(
            name, clips, base_name, base_clips,
            bootstrap=bootstrap, seed=seed, gate_margin=gate_margin,
        )
    return "\n".join(lines)


def _multi_markdown(
    results: list[tuple[str, list[ClipScore]]],
    base_name: str,
    *,
    bootstrap: int,
    seed: int,
    gate_margin: float,
) -> str:
    """A/B/C report: one aggregate row per engine, then each engine vs the baseline."""
    vocabs = DEFAULT_VOCABS
    by_name = dict(results)
    lines = ["# Chord eval — A/B/C", "", "## Aggregate (duration-weighted)", ""]
    lines += ["| engine | " + " | ".join(vocabs) + " |", "|" + "---|" * (len(vocabs) + 1)]
    for name, clips in results:
        agg = aggregate(clips, vocabs)
        tag = " _(baseline)_" if name == base_name else ""
        lines.append(f"| `{name}`{tag} | " + " | ".join(f"{agg[v]:.3f}" for v in vocabs) + " |")
    lines.append("")
    base_clips = by_name[base_name]
    for name, clips in results:
        if name == base_name:
            continue
        lines += _gate_block(
            name, clips, base_name, base_clips,
            bootstrap=bootstrap, seed=seed, gate_margin=gate_margin,
        )
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
    ap.add_argument("--engine", default=None, help="single engine: librosa | chordino | deep")
    ap.add_argument(
        "--engines",
        default=None,
        help="comma-separated engines for an A/B/C report, e.g. 'deep,chordino,librosa'",
    )
    ap.add_argument("--baseline", default=None, help="engine to compare against (the gate bar)")
    ap.add_argument("--out", default=None, help="markdown report path (default: stdout)")
    ap.add_argument("--csv", default=None, help="optional per-clip CSV path")
    ap.add_argument("--bootstrap", type=int, default=2000, help="bootstrap resamples for the Δ CI")
    ap.add_argument("--seed", type=int, default=0, help="bootstrap RNG seed (reproducible)")
    ap.add_argument(
        "--gate-margin", type=float, default=0.08,
        help="required majmin Δ CI-lower bound for a PASS verdict (gate target ~+0.08-0.10)",
    )
    args = ap.parse_args(argv)

    if not args.engine and not args.engines:
        ap.error("pass --engine or --engines")

    dataset = Path(args.dataset)
    pairs = _find_pairs(dataset)
    if not pairs:
        raise SystemExit(f"no audio+.lab pairs found under {dataset}/")

    if args.engines:
        names: list[str] = []
        for n in args.engines.split(","):
            n = n.strip()
            if n and n not in names:
                names.append(n)
        base_name = args.baseline or names[-1]  # default: last engine is the baseline
        if base_name not in names:
            names.append(base_name)
        results = [(n, _score_engine(n, pairs)) for n in names]
        report = _multi_markdown(
            results, base_name,
            bootstrap=args.bootstrap, seed=args.seed, gate_margin=args.gate_margin,
        )
        primary = results[0]
    else:
        clips = _score_engine(args.engine, pairs)
        baseline = (args.baseline, _score_engine(args.baseline, pairs)) if args.baseline else None
        report = _markdown(
            args.engine, clips, baseline,
            bootstrap=args.bootstrap, seed=args.seed, gate_margin=args.gate_margin,
        )
        primary = (args.engine, clips)

    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(report)
    if args.csv:
        _write_csv(Path(args.csv), primary[0], primary[1])
        print(f"wrote {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Chord-recognition scoring via ``mir_eval`` — the measurement half of Phase 0.

Given reference and predicted (intervals, labels), :func:`score_labels` returns
weighted chord-symbol recall under the standard MIREX vocabularies, and :func:`aggregate`
+ :func:`win_rate` roll clip scores up while guarding against a tiny eval set carrying the
go/no-go decision (per-clip win rate, not just the duration-weighted mean).

``mir_eval`` lives in the ``[ml]`` extra and is imported lazily, so importing this module
is cheap and safe without it; only the scoring calls require it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

Interval = tuple[float, float]

# MIREX comparison vocabularies, coarse -> fine. "majmin" is the headline metric the
# go/no-go gate is written against; "sevenths" exercises the wider vocabulary.
DEFAULT_VOCABS: tuple[str, ...] = ("root", "majmin", "sevenths", "thirds", "triads")


@dataclass(frozen=True)
class ClipScore:
    name: str
    duration: float
    scores: dict[str, float]  # vocab -> weighted accuracy in [0, 1]


def _as_array(intervals: list[Interval]) -> np.ndarray:
    return np.asarray(intervals, dtype=float).reshape(-1, 2)


def score_labels(
    ref_intervals: list[Interval],
    ref_labels: list[str],
    est_intervals: list[Interval],
    est_labels: list[str],
    vocabs: tuple[str, ...] = DEFAULT_VOCABS,
) -> dict[str, float]:
    """Weighted chord-symbol recall per vocabulary for one clip.

    Thin wrapper over ``mir_eval.chord.evaluate`` (which aligns the estimate to the
    reference span, filling gaps with no-chord). Returns only the requested vocabularies
    that ``mir_eval`` reports.
    """
    import mir_eval

    results = mir_eval.chord.evaluate(
        _as_array(ref_intervals), ref_labels,
        _as_array(est_intervals), est_labels,
    )
    return {v: float(results[v]) for v in vocabs if v in results}


def clip_duration(intervals: list[Interval]) -> float:
    if not intervals:
        return 0.0
    return max(e for _, e in intervals) - min(s for s, _ in intervals)


def aggregate(clips: list[ClipScore], vocabs: tuple[str, ...] = DEFAULT_VOCABS) -> dict[str, float]:
    """Duration-weighted mean of each vocabulary across clips."""
    total = sum(c.duration for c in clips)
    if total <= 0:
        return {v: 0.0 for v in vocabs}
    out: dict[str, float] = {}
    for v in vocabs:
        out[v] = sum(c.scores.get(v, 0.0) * c.duration for c in clips) / total
    return out


def win_rate(
    engine: list[ClipScore],
    baseline: list[ClipScore],
    metric: str = "majmin",
) -> tuple[float, list[tuple[str, float]]]:
    """Fraction of clips where ``engine`` beats ``baseline`` on ``metric``.

    Guards the gate against a small eval set: a big aggregate gain carried by one or two
    easy clips shows up here as a low win rate. Returns (rate, per-clip deltas).
    """
    by_name = {c.name: c for c in baseline}
    deltas: list[tuple[str, float]] = []
    wins = 0
    for c in engine:
        base = by_name.get(c.name)
        if base is None:
            continue
        delta = c.scores.get(metric, 0.0) - base.scores.get(metric, 0.0)
        deltas.append((c.name, delta))
        if delta > 1e-9:
            wins += 1
    rate = wins / len(deltas) if deltas else 0.0
    return rate, deltas

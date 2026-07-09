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


@dataclass(frozen=True)
class DeltaCI:
    point: float          # observed duration-weighted delta (engine - baseline)
    lo: float             # lower CI bound
    hi: float             # upper CI bound
    level: float          # e.g. 0.95
    n_clips: int


def bootstrap_delta_ci(
    engine: list[ClipScore],
    baseline: list[ClipScore],
    metric: str = "majmin",
    *,
    n_resamples: int = 2000,
    level: float = 0.95,
    seed: int = 0,
) -> DeltaCI:
    """Clip-level bootstrap CI on the duration-weighted ``engine - baseline`` delta.

    The second half of the small-eval-set guard (alongside :func:`win_rate`): resample the
    matched clips with replacement, recompute the duration-weighted mean delta each time,
    and report the ``level`` percentile interval. The gate's "meaningful margin" is credible
    only if the CI's lower bound clears the target (e.g. +0.08); a wide interval straddling
    zero means the eval set is too small/noisy to call. Deterministic for a given ``seed``.
    """
    by_name = {c.name: c for c in baseline}
    diffs: list[float] = []
    weights: list[float] = []
    for c in engine:
        base = by_name.get(c.name)
        if base is None:
            continue
        diffs.append(c.scores.get(metric, 0.0) - base.scores.get(metric, 0.0))
        weights.append(c.duration)
    n = len(diffs)
    if n == 0:
        return DeltaCI(0.0, 0.0, 0.0, level, 0)
    d = np.asarray(diffs, dtype=float)
    w = np.asarray(weights, dtype=float)

    def _weighted(idx: np.ndarray) -> float:
        wi = w[idx]
        total = wi.sum()
        return float((d[idx] * wi).sum() / total) if total > 0 else float(d[idx].mean())

    point = _weighted(np.arange(n))
    rng = np.random.default_rng(seed)
    samples = np.empty(n_resamples, dtype=float)
    for i in range(n_resamples):
        samples[i] = _weighted(rng.integers(0, n, size=n))
    alpha = (1.0 - level) / 2.0
    lo, hi = np.quantile(samples, [alpha, 1.0 - alpha])
    return DeltaCI(point, float(lo), float(hi), level, n)

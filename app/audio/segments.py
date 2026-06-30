"""Merge per-frame chord labels into contiguous timed segments."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.music_theory import Quality


@dataclass(frozen=True)
class DetectedSegment:
    start_time: float
    end_time: float
    root_pc: int
    quality: Quality


def merge_segments(
    labels: list[tuple[int, Quality]], boundaries: list[float]
) -> list[DetectedSegment]:
    """Collapse runs of identical labels. labels[i] covers [boundaries[i], boundaries[i+1])."""
    if len(boundaries) != len(labels) + 1:
        raise ValueError("boundaries must have exactly len(labels) + 1 entries")
    segments: list[DetectedSegment] = []
    for i, (root_pc, quality) in enumerate(labels):
        start, end = boundaries[i], boundaries[i + 1]
        previous = segments[-1] if segments else None
        if previous is not None and previous.root_pc == root_pc and previous.quality == quality:
            segments[-1] = DetectedSegment(previous.start_time, end, root_pc, quality)
        else:
            segments.append(DetectedSegment(start, end, root_pc, quality))
    return segments


def smooth_labels(
    labels: list[tuple[int, Quality]], window: int
) -> list[tuple[int, Quality]]:
    """Majority-vote each label against its neighbours to remove single-frame jitter."""
    if window <= 1 or len(labels) <= 1:
        return list(labels)
    half = window // 2
    out: list[tuple[int, Quality]] = []
    for i in range(len(labels)):
        lo, hi = max(0, i - half), min(len(labels), i + half + 1)
        counts: dict[tuple[int, Quality], int] = {}
        for label in labels[lo:hi]:
            counts[label] = counts.get(label, 0) + 1
        # Break ties toward the frame's own label so a real change is not erased.
        out.append(max(counts, key=lambda lab: (counts[lab], lab == labels[i])))
    return out


def _collapse_adjacent(segments: list[DetectedSegment]) -> list[DetectedSegment]:
    out: list[DetectedSegment] = []
    for s in segments:
        prev = out[-1] if out else None
        if prev is not None and prev.root_pc == s.root_pc and prev.quality == s.quality:
            out[-1] = DetectedSegment(prev.start_time, s.end_time, s.root_pc, s.quality)
        else:
            out.append(s)
    return out


def drop_short_segments(
    segments: list[DetectedSegment], min_seconds: float
) -> list[DetectedSegment]:
    """Absorb segments shorter than min_seconds into a neighbour, preserving time coverage."""
    segs = list(segments)
    while len(segs) > 1:
        idx = next(
            (i for i, s in enumerate(segs) if s.end_time - s.start_time < min_seconds),
            None,
        )
        if idx is None:
            break
        s = segs[idx]
        if idx == 0:
            nxt = segs[1]
            segs[1] = DetectedSegment(s.start_time, nxt.end_time, nxt.root_pc, nxt.quality)
            del segs[0]
        elif idx == len(segs) - 1:
            prev = segs[idx - 1]
            segs[idx - 1] = DetectedSegment(prev.start_time, s.end_time, prev.root_pc, prev.quality)
            del segs[idx]
        else:
            prev, nxt = segs[idx - 1], segs[idx + 1]
            prev_len = prev.end_time - prev.start_time
            nxt_len = nxt.end_time - nxt.start_time
            if prev_len >= nxt_len:
                segs[idx - 1] = DetectedSegment(prev.start_time, s.end_time, prev.root_pc, prev.quality)
            else:
                segs[idx + 1] = DetectedSegment(s.start_time, nxt.end_time, nxt.root_pc, nxt.quality)
            del segs[idx]
    return _collapse_adjacent(segs)


def shift_segments(segments: list[DetectedSegment], offset: float) -> list[DetectedSegment]:
    """Translate every segment in time by offset seconds (used to undo silence trimming)."""
    if offset == 0:
        return list(segments)
    return [
        DetectedSegment(s.start_time + offset, s.end_time + offset, s.root_pc, s.quality)
        for s in segments
    ]


def beat_boundaries(beat_times: np.ndarray, duration: float, n_segments: int) -> list[float]:
    """Return n_segments + 1 ascending time edges bracketed by 0.0 and duration."""
    if n_segments < 1:
        raise ValueError("n_segments must be >= 1")
    interior_needed = n_segments - 1
    interior = sorted(float(t) for t in beat_times if 0.0 < t < float(duration))
    if interior_needed == 0:
        interior = []
    elif len(interior) > interior_needed:
        keep = np.linspace(0, len(interior) - 1, interior_needed).round().astype(int)
        interior = [interior[i] for i in keep]
    elif len(interior) < interior_needed:
        interior = list(np.linspace(0.0, float(duration), n_segments + 1)[1:-1])
    return [0.0] + interior + [float(duration)]

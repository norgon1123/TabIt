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

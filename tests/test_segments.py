import numpy as np
import pytest

from app.audio.segments import DetectedSegment, beat_boundaries, merge_segments
from app.music_theory import Quality


def test_merges_consecutive_identical_labels():
    labels = [(0, Quality.MAJ), (0, Quality.MAJ), (7, Quality.MAJ)]
    assert merge_segments(labels, [0.0, 1.0, 2.0, 3.0]) == [
        DetectedSegment(0.0, 2.0, 0, Quality.MAJ),
        DetectedSegment(2.0, 3.0, 7, Quality.MAJ),
    ]


def test_quality_change_breaks_a_segment():
    labels = [(0, Quality.MAJ), (0, Quality.MAJ7)]
    assert len(merge_segments(labels, [0.0, 1.0, 2.0])) == 2


def test_empty_labels_yield_no_segments():
    assert merge_segments([], [0.0]) == []


def test_boundary_count_mismatch_raises():
    with pytest.raises(ValueError):
        merge_segments([(0, Quality.MAJ)], [0.0, 1.0, 2.0])


def test_beat_boundaries_returns_exact_count():
    edges = beat_boundaries(np.array([1.0, 2.0, 3.0]), duration=4.0, n_segments=2)
    assert len(edges) == 3
    assert edges[0] == 0.0
    assert edges[-1] == 4.0
    assert edges == sorted(edges)


def test_beat_boundaries_fills_when_too_few_beats():
    edges = beat_boundaries(np.array([]), duration=4.0, n_segments=4)
    assert len(edges) == 5
    assert edges == sorted(edges)
    assert edges[0] == 0.0 and edges[-1] == 4.0


def test_beat_boundaries_single_segment():
    assert beat_boundaries(np.array([1.0, 2.0]), 3.0, 1) == [0.0, 3.0]


def test_beat_boundaries_rejects_zero_segments():
    with pytest.raises(ValueError):
        beat_boundaries(np.array([1.0]), 3.0, 0)

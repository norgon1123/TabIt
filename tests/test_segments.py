import numpy as np
import pytest

from app.audio.segments import (
    DetectedSegment,
    beat_boundaries,
    drop_short_segments,
    merge_segments,
    shift_segments,
    smooth_labels,
)
from app.music_theory import Quality


def test_smooth_labels_removes_single_frame_jitter():
    c, g = (0, Quality.MAJ), (7, Quality.MAJ)
    labels = [c, c, g, c, c]  # lone G is noise
    assert smooth_labels(labels, window=3) == [c, c, c, c, c]


def test_smooth_labels_keeps_real_changes():
    c, g = (0, Quality.MAJ), (7, Quality.MAJ)
    labels = [c, c, c, g, g, g]
    assert smooth_labels(labels, window=3) == labels


def test_drop_short_segments_absorbs_into_longer_neighbour():
    segs = [
        DetectedSegment(0.0, 2.0, 0, Quality.MAJ),
        DetectedSegment(2.0, 2.1, 7, Quality.MAJ),  # too short
        DetectedSegment(2.1, 4.0, 5, Quality.MAJ),
    ]
    out = drop_short_segments(segs, min_seconds=0.5)
    assert [(s.start_time, s.end_time, s.root_pc) for s in out] == [
        (0.0, 2.1, 0),
        (2.1, 4.0, 5),
    ]


def test_drop_short_segments_preserves_full_coverage():
    segs = [DetectedSegment(0.0, 0.1, 0, Quality.MAJ), DetectedSegment(0.1, 4.0, 7, Quality.MAJ)]
    out = drop_short_segments(segs, min_seconds=0.5)
    assert out[0].start_time == 0.0 and out[-1].end_time == 4.0


def test_shift_segments_translates_in_time():
    segs = [DetectedSegment(0.0, 2.0, 0, Quality.MAJ)]
    assert shift_segments(segs, 1.5) == [DetectedSegment(1.5, 3.5, 0, Quality.MAJ)]


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

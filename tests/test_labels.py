import pytest

from app.audio.labels import (
    NO_CHORD,
    format_lab,
    parse_lab,
    segment_label,
    segments_to_lab,
    validate_labels,
)
from app.audio.segments import DetectedSegment
from app.music_theory import Quality


def test_segment_label_covers_all_qualities():
    assert segment_label(0, Quality.MAJ) == "C:maj"
    assert segment_label(9, Quality.MIN) == "A:min"
    assert segment_label(7, Quality.DOM7) == "G:7"
    assert segment_label(2, Quality.MAJ7) == "D:maj7"
    assert segment_label(4, Quality.MIN7) == "E:min7"


def test_segments_to_lab_fills_leading_and_trailing_gaps_with_no_chord():
    segs = [DetectedSegment(0.5, 1.0, 0, Quality.MAJ)]
    intervals, labels = segments_to_lab(segs, span_end=2.0)
    assert intervals == [(0.0, 0.5), (0.5, 1.0), (1.0, 2.0)]
    assert labels == [NO_CHORD, "C:maj", NO_CHORD]


def test_segments_to_lab_bridges_interior_gap():
    segs = [
        DetectedSegment(0.0, 1.0, 0, Quality.MAJ),
        DetectedSegment(1.5, 2.0, 7, Quality.MIN7),
    ]
    intervals, labels = segments_to_lab(segs)
    assert labels == ["C:maj", NO_CHORD, "G:min7"]
    assert intervals[1] == (1.0, 1.5)


def test_lab_text_round_trips():
    intervals = [(0.0, 1.25), (1.25, 3.5)]
    labels = ["C:maj", "A:min7"]
    text = format_lab(intervals, labels)
    back_i, back_l = parse_lab(text)
    assert back_l == labels
    assert back_i == intervals


def test_parse_lab_ignores_blank_lines_and_handles_no_chord():
    text = "0.000\t0.500\tN\n\n0.500\t1.000\tC:maj\n"
    intervals, labels = parse_lab(text)
    assert labels == ["N", "C:maj"]
    assert intervals == [(0.0, 0.5), (0.5, 1.0)]


def test_parse_lab_flags_colon_typo_with_line_number():
    # ':' typed for '.' in a time field — the recurring hand-editing slip.
    text = "0.000\t0.500\tN\n0.500\t1:000\tC:maj\n"
    with pytest.raises(ValueError, match=r"line 2"):
        parse_lab(text)


def test_validate_labels_catches_overlap_and_backwards_segment():
    intervals = [(0.0, 1.0), (0.9, 2.0)]  # 1.0 > 0.9 -> overlap
    assert any("overlap" in m for m in validate_labels(intervals, ["C:maj", "A:min"]))
    assert validate_labels([(1.0, 0.5)], ["C:maj"])  # start >= end
    assert validate_labels([(0.0, 1.0), (1.0, 2.0)], ["C:maj", "A:min"]) == []  # clean

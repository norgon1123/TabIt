import pytest

from app.audio.chordino import chordino_segments, parse_chord_label
from app.music_theory import Quality


# --- label parsing -------------------------------------------------------------

@pytest.mark.parametrize(
    "label, expected",
    [
        ("C", (0, Quality.MAJ)),
        ("Am", (9, Quality.MIN)),
        ("G7", (7, Quality.DOM7)),
        ("Cmaj7", (0, Quality.MAJ7)),
        ("Dm7", (2, Quality.MIN7)),
        ("F#", (6, Quality.MAJ)),
        ("Bb", (10, Quality.MAJ)),
        ("Bdim", (11, Quality.MIN)),    # diminished collapses to minor
        ("Caug", (0, Quality.MAJ)),     # augmented collapses to major
        ("F6", (5, Quality.MAJ)),       # major sixth -> major
        ("Cm6", (0, Quality.MIN)),      # minor sixth -> minor
        ("Csus4", (0, Quality.MAJ)),    # sus -> major
        ("C9", (0, Quality.DOM7)),      # dominant ninth -> dom7
        ("Cmaj9", (0, Quality.MAJ7)),   # major ninth -> maj7
        ("Cm9", (0, Quality.MIN7)),     # minor ninth -> min7
        ("F/C", (5, Quality.MAJ)),      # slash chord: keep root, drop bass
        ("Dm7/A", (2, Quality.MIN7)),   # slash on an extended chord
    ],
)
def test_parse_known_labels(label, expected):
    assert parse_chord_label(label) == expected


@pytest.mark.parametrize("label", ["N", "X", "", "?"])
def test_parse_no_chord_returns_none(label):
    assert parse_chord_label(label) is None


def test_unknown_suffix_falls_back_sensibly():
    # An unseen minor-ish suffix still reduces to a minor quality, not a crash.
    root, quality = parse_chord_label("Cm11")
    assert root == 0
    assert quality in (Quality.MIN, Quality.MIN7)


# --- segment construction from change-points -----------------------------------

def _entry(label, ts):
    return {"label": label, "timestamp": ts}


def test_builds_segments_from_change_points():
    entries = [
        _entry("N", 0.4),
        _entry("C", 0.5),
        _entry("G7", 2.5),
        _entry("N", 4.5),
    ]
    segs = chordino_segments(entries, duration=5.0, min_segment_seconds=0.5)
    assert [(s.root_pc, s.quality) for s in segs] == [(0, Quality.MAJ), (7, Quality.DOM7)]
    assert segs[0].start_time == pytest.approx(0.5)
    assert segs[0].end_time == pytest.approx(2.5)
    assert segs[1].end_time == pytest.approx(4.5)  # bounded by the trailing N


def test_leading_and_trailing_no_chord_is_excluded():
    entries = [_entry("N", 0.0), _entry("C", 1.0), _entry("N", 3.0)]
    segs = chordino_segments(entries, duration=4.0, min_segment_seconds=0.25)
    assert len(segs) == 1
    assert segs[0].start_time == pytest.approx(1.0)
    assert segs[0].end_time == pytest.approx(3.0)  # trailing silence trimmed


def test_adjacent_equal_labels_merge():
    # "C" then "C/E" reduce to the same chord and should become one segment.
    entries = [_entry("C", 0.0), _entry("C/E", 1.0), _entry("N", 2.0)]
    segs = chordino_segments(entries, duration=2.0, min_segment_seconds=0.25)
    assert len(segs) == 1
    assert (segs[0].root_pc, segs[0].quality) == (0, Quality.MAJ)
    assert segs[0].end_time == pytest.approx(2.0)


def test_no_chords_returns_empty():
    assert chordino_segments([_entry("N", 0.0)], duration=2.0, min_segment_seconds=0.5) == []


def test_last_chord_runs_to_duration_when_no_trailing_marker():
    entries = [_entry("C", 0.0), _entry("Am", 2.0)]
    segs = chordino_segments(entries, duration=4.0, min_segment_seconds=0.5)
    assert segs[-1].end_time == pytest.approx(4.0)

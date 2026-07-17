import pytest

from app.audio.analyzer import AnalysisResult
from app.audio.segments import DetectedSegment
from app.chart_seed import build_chart_seed
from app.music_theory import Quality

# A steady 120 BPM grid: one beat every 0.5s, beat 0 at t=0. Beat b sits at t = b * 0.5.
BEATS = [i * 0.5 for i in range(33)]  # 0.0 .. 16.0s -> beats 0..32


def _result(segments, duration=16.0):
    return AnalysisResult(
        segments=segments,
        beat_times=BEATS,
        bpm=120.0,
        duration=duration,
        key_tonic_pc=0,
        key_mode="major",
        engine_version="test",
    )


def _seg(start_s, end_s, root_pc=0):
    return DetectedSegment(start_time=start_s, end_time=end_s, root_pc=root_pc, quality=Quality.MAJ)


def test_boundaries_land_on_whole_beats():
    # 1.75s -> beat 3.5. Nearest bar line (4) is 0.5 away -> pulled to 4.
    # 3.10s -> beat 6.2. Nearest bar line is 1.8 away -> nearest whole beat, 6.
    seed = build_chart_seed(_result([_seg(0.0, 1.75), _seg(1.75, 3.10, 7), _seg(3.10, 16.0, 5)]))
    ends = [s.end_beat for s in seed.segments]
    assert ends[0] == pytest.approx(4.0)
    assert ends[1] == pytest.approx(6.0)
    # Contiguous: each chord starts where the last one ended.
    assert [s.start_beat for s in seed.segments] == pytest.approx([0.0, 4.0, 6.0])


def test_a_whole_beat_boundary_survives_the_seed():
    """The invariant, end to end: beat 6 is a real mid-bar change and must not move."""
    seed = build_chart_seed(_result([_seg(0.0, 3.0), _seg(3.0, 16.0, 7)]))
    assert seed.segments[0].end_beat == pytest.approx(6.0)


def test_a_sub_beat_chord_is_dropped_not_emitted_at_zero_length():
    # 0.10s -> beat 0.2, which snaps to 0. A zero-length chord must not reach the chart.
    seed = build_chart_seed(_result([_seg(0.0, 0.10), _seg(0.10, 16.0, 7)]))
    assert all(s.end_beat - s.start_beat >= 1.0 for s in seed.segments)
    assert len(seed.segments) == 1


def test_the_final_chord_clamps_to_the_recording_and_may_be_fractional():
    """A chart's total length must NEVER exceed the recording's duration."""
    # duration 15.75s -> max_beat 31.5. The chord wants to run to beat 32.
    seed = build_chart_seed(_result([_seg(0.0, 16.0)], duration=15.75))
    assert seed.segments[-1].end_beat == pytest.approx(31.5)


def test_the_pull_tolerance_is_honoured():
    # 1.75s -> beat 3.5. With no pull, it snaps to the nearest whole beat (4 — ties round up),
    # which is the same answer here; use 3.4 -> beat 6.8 instead to separate the two rules.
    # 3.40s -> beat 6.8: pull 0.75 -> bar line 8 is 1.2 away -> no pull -> 7.
    seed = build_chart_seed(_result([_seg(0.0, 3.40), _seg(3.40, 16.0, 7)]))
    assert seed.segments[0].end_beat == pytest.approx(7.0)

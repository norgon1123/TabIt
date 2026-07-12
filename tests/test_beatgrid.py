import pytest

from app.audio.beatgrid import (
    beat_for_time,
    ensure_grid,
    snap_half,
    time_for_beat,
    total_beats,
)

# A steady 120 BPM grid: one beat every 0.5s, beat 0 at t=0.
GRID = [0.0, 0.5, 1.0, 1.5, 2.0]


def test_time_for_beat_on_grid():
    assert time_for_beat(0, GRID, 2.0) == pytest.approx(0.0)
    assert time_for_beat(2, GRID, 2.0) == pytest.approx(1.0)


def test_time_for_beat_half_beat_interpolates():
    assert time_for_beat(1.5, GRID, 2.0) == pytest.approx(0.75)


def test_time_for_beat_extrapolates_past_last_onset():
    # Beat 6 is two beats past the last onset (beat 4 @ 2.0), interval 0.5 -> 3.0,
    # but clamped to duration.
    assert time_for_beat(6, GRID, 10.0) == pytest.approx(3.0)
    assert time_for_beat(6, GRID, 2.5) == pytest.approx(2.5)


def test_beat_for_time_is_inverse():
    assert beat_for_time(0.75, GRID) == pytest.approx(1.5)
    assert beat_for_time(1.0, GRID) == pytest.approx(2.0)


def test_beat_for_time_extrapolates_and_clamps():
    assert beat_for_time(3.0, GRID) == pytest.approx(6.0)
    assert beat_for_time(-1.0, GRID) == pytest.approx(0.0)


def test_snap_half():
    assert snap_half(1.24) == 1.0
    assert snap_half(1.26) == 1.5
    assert snap_half(1.75) == 2.0


def test_ensure_grid_synthesizes_when_too_few_onsets():
    grid = ensure_grid([], bpm=120.0, duration=2.0)
    assert grid[0] == 0.0
    assert grid[1] == pytest.approx(0.5)
    assert grid[-1] >= 2.0


def test_ensure_grid_keeps_real_onsets():
    assert ensure_grid(GRID, bpm=120.0, duration=2.0) == GRID


def test_total_beats():
    assert total_beats(GRID, 1.0) == pytest.approx(2.0)

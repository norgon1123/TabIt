import pytest

from app.audio.beatgrid import (
    beat_for_time,
    ensure_grid,
    rescale_grid,
    rescale_windows,
    snap_half,
    time_for_beat,
    total_beats,
    whole_bpm,
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


def test_ensure_grid_backfills_beats_before_the_first_onset():
    # librosa's beat tracker routinely finds no onsets until the groove settles — on the
    # eval track the first beat lands 7.9s in. Without beats covering that head the whole
    # intro maps to beat 0 (see beat_for_time's clamp) and its chords are lost, so the grid
    # must be extended backwards at the detected interval until it reaches t=0.
    onsets = [7.918, 8.336, 8.754, 9.172]
    grid = ensure_grid(onsets, bpm=143.6, duration=20.0)

    interval = onsets[1] - onsets[0]
    assert 0.0 <= grid[0] < interval  # the grid now starts within one beat of t=0
    assert grid[: -len(onsets)]  # beats were prepended
    assert grid[-len(onsets) :] == onsets  # the detected onsets survive untouched
    steps = [b - a for a, b in zip(grid, grid[1:])]
    assert all(step == pytest.approx(interval) for step in steps)


def test_backfilled_grid_separates_chords_in_the_intro():
    # The bug in one line: two chords that end before the first detected beat used to
    # collapse onto beat 0 and become indistinguishable.
    grid = ensure_grid([7.918, 8.336, 8.754], bpm=143.6, duration=20.0)
    assert beat_for_time(4.81, grid) > beat_for_time(0.91, grid) > 0.0


def test_total_beats():
    assert total_beats(GRID, 1.0) == pytest.approx(2.0)


def test_rescale_grid_halving_keeps_every_second_onset():
    # Halving the tempo means one beat where there were two: the new grid is the old one's
    # even beats, so it stays on the onsets the tracker actually found.
    grid = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    assert rescale_grid(grid, 0.5, duration=3.0) == pytest.approx([0.0, 1.0, 2.0, 3.0])


def test_rescale_grid_doubling_inserts_midpoints():
    grid = [0.0, 0.5, 1.0]
    assert rescale_grid(grid, 2.0, duration=1.0) == pytest.approx(
        [0.0, 0.25, 0.5, 0.75, 1.0]
    )


def test_rescale_grid_follows_a_drifting_grid_rather_than_a_metronome():
    # The tracked grid slows down (0.5s, then 0.6s between beats). Halving keeps the drift
    # instead of laying a rigid click at the requested BPM.
    grid = [0.0, 0.5, 1.0, 1.6, 2.2]
    assert rescale_grid(grid, 0.5, duration=2.2) == pytest.approx([0.0, 1.0, 2.2])


def test_rescale_grid_rejects_a_non_positive_factor():
    with pytest.raises(ValueError):
        rescale_grid(GRID, 0.0, duration=2.0)


def test_rescale_windows_halves_beat_counts_over_the_same_audio():
    # Two 8-beat chords at the detected tempo become two 4-beat chords when the player
    # counts the song at half that tempo — the audio each chord covers is unchanged.
    windows = rescale_windows([(0.0, 8.0), (8.0, 16.0)], 0.5, max_beat=8.0)
    assert windows == [(0.0, 4.0), (4.0, 8.0)]


def test_rescale_windows_holds_the_half_beat_minimum():
    # A 0.5-beat chord cannot halve to 0.25; it keeps the minimum length and pushes on.
    windows = rescale_windows([(0.0, 0.5), (0.5, 4.0)], 0.5, max_beat=4.0)
    assert windows == [(0.0, 0.5), (0.5, 2.0)]


def test_rescale_windows_drops_a_window_with_no_room_left():
    windows = rescale_windows([(0.0, 4.0), (4.0, 4.5)], 0.5, max_beat=2.0)
    assert windows == [(0.0, 2.0), None]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(143.6, 144), (71.8, 72), (120.0, 120), (72.5, 72), (0.4, None), (0.0, None), (None, None)],
)
def test_whole_bpm_rounds_to_a_countable_tempo(raw, expected):
    # A tempo is something a player counts; the fraction is noise, and a tempo that rounds
    # to zero is no tempo at all. (72.5 -> 72: banker's rounding, and nothing depends on
    # which way a .5 goes.)
    assert whole_bpm(raw) == expected

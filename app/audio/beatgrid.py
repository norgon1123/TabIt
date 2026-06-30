"""Pure beat<->time conversion over a detected beat-onset grid.

A *grid* is an ascending list of beat-onset times in seconds; index i is beat i.
Positions between or beyond onsets are linearly interpolated / extrapolated using
the surrounding (or final) inter-beat interval. All times are in original-audio
seconds; callers shift detected onsets to that frame before building the grid.
"""

from __future__ import annotations

import bisect

_DEFAULT_BPM = 120.0


def snap_half(beat: float) -> float:
    """Round a beat position to the nearest half-beat (eighth)."""
    return round(beat * 2.0) / 2.0


def ensure_grid(beat_times: list[float], bpm: float | None, duration: float) -> list[float]:
    """Return a usable grid (>= 2 ascending entries).

    When detection produced fewer than two onsets, synthesize a uniform grid from
    `bpm` (falling back to 120 BPM) anchored at t=0 and spanning past `duration`.
    """
    clean = sorted(float(t) for t in beat_times)
    if len(clean) >= 2:
        return clean
    tempo = bpm if bpm and bpm > 0 else _DEFAULT_BPM
    interval = 60.0 / tempo
    span = max(duration, interval * 2)
    n = int(span / interval) + 2
    return [round(i * interval, 6) for i in range(n)]


def _interval(grid: list[float], i: int) -> float:
    """Inter-beat interval at index i, falling back to the final interval."""
    if 0 <= i < len(grid) - 1:
        step = grid[i + 1] - grid[i]
    else:
        step = grid[-1] - grid[-2]
    return step if step > 0 else 60.0 / _DEFAULT_BPM


def time_for_beat(beat: float, grid: list[float], duration: float) -> float:
    """Beat index -> seconds, clamped to [0, duration]."""
    if beat <= 0:
        return 0.0
    last = len(grid) - 1
    if beat >= last:
        seconds = grid[-1] + (beat - last) * _interval(grid, last)
    else:
        i = int(beat)
        seconds = grid[i] + (beat - i) * _interval(grid, i)
    return max(0.0, min(duration, seconds))


def beat_for_time(time: float, grid: list[float]) -> float:
    """Seconds -> fractional beat (inverse of time_for_beat), clamped to >= 0."""
    if time <= grid[0]:
        return 0.0
    if time >= grid[-1]:
        return (len(grid) - 1) + (time - grid[-1]) / _interval(grid, len(grid) - 1)
    i = bisect.bisect_right(grid, time) - 1
    return i + (time - grid[i]) / _interval(grid, i)


def total_beats(grid: list[float], duration: float) -> float:
    """The fractional beat reached at `duration` — the chart's maximum end_beat."""
    return beat_for_time(duration, grid)

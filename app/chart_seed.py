"""Turn an AnalysisResult into the chart that seeds it — beats, not seconds.

Kept storage-agnostic on purpose: the same seed becomes ORM rows for a signed-in user's
recording and in-memory objects for a guest's (see app/jobs.py), so the beat math that
decides where a chord starts and ends exists once.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.audio.analyzer import AnalysisResult
from app.audio.beatgrid import beat_for_time, ensure_grid, snap_half, total_beats
from app.music_theory import key_prefers_flats, pitch_class_to_note, tonic_for_pitch_class


@dataclass(frozen=True)
class SeededSegment:
    start_beat: float
    end_beat: float
    chord_root: str
    chord_quality: str


@dataclass(frozen=True)
class ChartSeed:
    key_tonic: str
    key_mode: str
    beat_times: list[float]
    segments: list[SeededSegment]


def build_chart_seed(result: AnalysisResult) -> ChartSeed:
    """Lay the detected chords out contiguously on the beat grid, half-beat snapped and
    clamped to the recording's decoded length."""
    duration = result.duration
    grid = ensure_grid(result.beat_times, result.bpm, duration)
    max_beat = total_beats(grid, duration)

    tonic = tonic_for_pitch_class(result.key_tonic_pc, result.key_mode)
    prefer_flats = key_prefers_flats(tonic, result.key_mode)

    segments: list[SeededSegment] = []
    cursor = 0.0  # beats; chords are laid out contiguously from beat 0
    for segment in result.segments:
        end_beat = snap_half(beat_for_time(min(segment.end_time, duration), grid))
        end_beat = min(end_beat, max_beat)
        if end_beat - cursor < 0.5:  # too short after snapping; skip
            continue
        segments.append(
            SeededSegment(
                start_beat=cursor,
                end_beat=end_beat,
                chord_root=pitch_class_to_note(segment.root_pc, prefer_flats=prefer_flats),
                chord_quality=segment.quality.value,
            )
        )
        cursor = end_beat

    return ChartSeed(
        key_tonic=tonic,
        key_mode=result.key_mode,
        beat_times=grid,
        segments=segments,
    )

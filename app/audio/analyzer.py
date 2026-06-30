"""Full audio-analysis pipeline: decode -> beat/chroma -> key -> chords -> segments."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import librosa
import numpy as np

from app.audio.decode import decode_to_mono
from app.audio.key_estimation import estimate_key
from app.audio.recognizer import ChordRecognizer, TemplateChordRecognizer
from app.audio.segments import (
    DetectedSegment,
    drop_short_segments,
    merge_segments,
    shift_segments,
    smooth_labels,
)

ENGINE_VERSION = "template-v2"


@dataclass(frozen=True)
class AnalysisResult:
    bpm: float
    key_tonic_pc: int
    key_mode: str
    duration: float
    segments: list[DetectedSegment] = field(default_factory=list)
    engine_version: str = ENGINE_VERSION


class Analyzer(Protocol):
    def analyze(self, audio_path: str) -> AnalysisResult: ...


def _trim_silence(y: np.ndarray, sr: int, top_db: float) -> tuple[np.ndarray, float]:
    """Strip leading/trailing silence; return trimmed audio and the leading offset in seconds."""
    trimmed, index = librosa.effects.trim(y, top_db=top_db)
    if trimmed.size == 0:
        return y, 0.0
    return trimmed, float(index[0]) / sr


class LibrosaAnalyzer:
    """v2 analyzer: silence-trimmed, frame-accurate template chord recognition."""

    def __init__(
        self,
        sample_rate: int = 22050,
        recognizer: ChordRecognizer | None = None,
        hop_length: int = 2048,
        smooth_seconds: float = 0.4,
        min_segment_seconds: float = 0.4,
        silence_top_db: float = 30.0,
    ) -> None:
        self._sr = sample_rate
        self._recognizer = recognizer or TemplateChordRecognizer()
        self._hop = hop_length
        self._smooth_seconds = smooth_seconds
        self._min_segment_seconds = min_segment_seconds
        self._silence_top_db = silence_top_db

    def analyze(self, audio_path: str) -> AnalysisResult:
        y = decode_to_mono(audio_path, self._sr)
        if y.size == 0:
            raise RuntimeError("decoded audio is empty")
        # The decoded PCM length is the authoritative duration; the chart must fit inside it.
        duration = float(len(y) / self._sr)

        # #5: ignore leading/trailing silence so the chart spans only the audible region.
        y_trim, lead = _trim_silence(y, self._sr, self._silence_top_db)
        trimmed_dur = float(len(y_trim) / self._sr)

        tempo, _ = librosa.beat.beat_track(y=y_trim, sr=self._sr)
        bpm = float(np.atleast_1d(tempo)[0])

        chroma = librosa.feature.chroma_cqt(y=y_trim, sr=self._sr, hop_length=self._hop)
        tonic_pc, mode = estimate_key(chroma.mean(axis=1))

        labels = self._recognizer.recognize(chroma)
        if not labels:
            return AnalysisResult(bpm, tonic_pc, mode, duration, [])

        # #4: label per high-resolution frame and cut on the actual change, not the nearest beat.
        window = max(1, round(self._smooth_seconds * self._sr / self._hop))
        labels = smooth_labels(labels, window)

        frame_times = librosa.frames_to_time(
            np.arange(len(labels) + 1), sr=self._sr, hop_length=self._hop
        )
        boundaries = [min(float(t), trimmed_dur) for t in frame_times]
        boundaries[0], boundaries[-1] = 0.0, trimmed_dur

        segments = merge_segments(labels, boundaries)
        segments = drop_short_segments(segments, self._min_segment_seconds)
        segments = shift_segments(segments, lead)
        return AnalysisResult(bpm, tonic_pc, mode, duration, segments)

"""Full audio-analysis pipeline: decode -> beat/chroma -> key -> chords -> segments."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import librosa
import numpy as np

from app.audio.decode import decode_to_mono
from app.audio.key_estimation import estimate_key
from app.audio.recognizer import ChordRecognizer, TemplateChordRecognizer
from app.audio.segments import DetectedSegment, beat_boundaries, merge_segments

ENGINE_VERSION = "template-v1"


@dataclass(frozen=True)
class AnalysisResult:
    bpm: float
    key_tonic_pc: int
    key_mode: str
    segments: list[DetectedSegment] = field(default_factory=list)
    engine_version: str = ENGINE_VERSION


class Analyzer(Protocol):
    def analyze(self, audio_path: str) -> AnalysisResult: ...


class LibrosaAnalyzer:
    """v1 analyzer: librosa features + template chord recognition."""

    def __init__(
        self, sample_rate: int = 22050, recognizer: ChordRecognizer | None = None
    ) -> None:
        self._sr = sample_rate
        self._recognizer = recognizer or TemplateChordRecognizer()

    def analyze(self, audio_path: str) -> AnalysisResult:
        y = decode_to_mono(audio_path, self._sr)
        if y.size == 0:
            raise RuntimeError("decoded audio is empty")
        duration = float(librosa.get_duration(y=y, sr=self._sr))

        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=self._sr)
        bpm = float(np.atleast_1d(tempo)[0])

        chroma = librosa.feature.chroma_cqt(y=y, sr=self._sr)
        tonic_pc, mode = estimate_key(chroma.mean(axis=1))

        if beat_frames.size >= 2:
            synced = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
            beat_times = librosa.frames_to_time(beat_frames, sr=self._sr)
        else:
            synced = chroma.mean(axis=1, keepdims=True)
            beat_times = np.array([])

        labels = self._recognizer.recognize(synced)
        boundaries = beat_boundaries(beat_times, duration, len(labels))
        segments = merge_segments(labels, boundaries)
        return AnalysisResult(bpm, tonic_pc, mode, segments)

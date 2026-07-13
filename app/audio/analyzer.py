"""Full audio-analysis pipeline: decode -> beat/chroma -> key -> chords -> segments."""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import librosa
import numpy as np

from app.audio.beatgrid import whole_bpm
from app.audio.chordino import chordino_segments
from app.audio.decode import decode_to_mono
from app.audio.decoding import viterbi_decode
from app.audio.deep_chord import BTCChordEngine
from app.audio.key_estimation import estimate_key
from app.audio.recognizer import ChordRecognizer, TemplateChordRecognizer
from app.audio.segments import (
    DetectedSegment,
    drop_short_segments,
    merge_segments,
    shift_segments,
)
from app.audio.separation import SeparationService

ENGINE_VERSION = "hmm-v3"
CHORDINO_ENGINE_VERSION = "chordino-v1"
BTC_ENGINE_VERSION = "btc-v1"
_CHORDINO_PLUGIN = "nnls-chroma:chordino"


@dataclass(frozen=True)
class AnalysisResult:
    bpm: float  # always a whole number: every engine rounds through `whole_bpm`
    key_tonic_pc: int
    key_mode: str
    duration: float
    segments: list[DetectedSegment] = field(default_factory=list)
    engine_version: str = ENGINE_VERSION
    beat_times: list[float] = field(default_factory=list)


class Analyzer(Protocol):
    def analyze(self, audio_path: str) -> AnalysisResult: ...


def _trim_silence(
    y: np.ndarray, sr: int, top_db: float, min_content_seconds: float = 0.5
) -> tuple[np.ndarray, float]:
    """Strip leading/trailing silence, judging content by sustained dB level.

    Splits the signal into non-silent intervals (anything within `top_db` of the peak)
    rather than trimming from the first above-threshold frame. A brief loud transient at
    the very start — a click or pop before the real silence — would otherwise anchor a
    naive trim at t~=0; here any interval shorter than `min_content_seconds` is treated as
    such a transient and ignored, so the audio is trimmed to span only the real content.
    Returns the trimmed audio and the leading offset (in seconds) that was removed.
    """
    intervals = librosa.effects.split(y, top_db=top_db)
    if len(intervals) == 0:
        return y, 0.0
    min_len = int(min_content_seconds * sr)
    substantial = [iv for iv in intervals if iv[1] - iv[0] >= min_len]
    chosen = substantial if substantial else intervals
    start, end = int(chosen[0][0]), int(chosen[-1][1])
    trimmed = y[start:end]
    if trimmed.size == 0:
        return y, 0.0
    return trimmed, start / sr


def _tempo_key_beats(
    y: np.ndarray, sr: int, lead: float = 0.0
) -> tuple[float, int, str, list[float]]:
    """Estimate bpm, key and the beat grid with librosa.

    Shared by the engines that only transcribe chords and so have no beat grid of their
    own. `y` is expected to be silence-trimmed and `lead` the offset that trim removed;
    the onsets are shifted back by it so the grid is in original-audio time, which is the
    frame the chart is laid out in (see app/audio/beatgrid.py).
    """
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="time")
    bpm = float(whole_bpm(float(np.atleast_1d(tempo)[0])) or 0.0)
    beat_times = [float(t) + lead for t in np.atleast_1d(beat_frames)]
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    tonic_pc, mode = estimate_key(chroma.mean(axis=1))
    return bpm, tonic_pc, mode, beat_times


def _chroma_features(y: np.ndarray, sr: int, hop_length: int, use_hpss: bool) -> np.ndarray:
    """CQT chroma, optionally taken from the harmonic component to suppress noise."""
    if use_hpss:
        y = librosa.effects.hpss(y)[0]  # keep harmonic part; drop percussion/transients
    return librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)


class LibrosaAnalyzer:
    """v3 analyzer: HPSS chroma + extension-tolerant scoring + Viterbi decoding."""

    def __init__(
        self,
        sample_rate: int = 22050,
        recognizer: ChordRecognizer | None = None,
        hop_length: int = 2048,
        min_segment_seconds: float = 0.75,  # round 2 #1: drop sub-0.75s false positives
        silence_top_db: float = 30.0,
        silence_min_content_seconds: float = 0.5,  # ignore sub-0.5s edge transients
        change_penalty: float = 1.0,  # tier 1: Viterbi self-stay bias
        use_hpss: bool = True,  # tier 1: analyse the harmonic component
    ) -> None:
        self._sr = sample_rate
        self._recognizer = recognizer or TemplateChordRecognizer()
        self._hop = hop_length
        self._min_segment_seconds = min_segment_seconds
        self._silence_top_db = silence_top_db
        self._silence_min_content_seconds = silence_min_content_seconds
        self._change_penalty = change_penalty
        self._use_hpss = use_hpss

    def analyze(self, audio_path: str) -> AnalysisResult:
        y = decode_to_mono(audio_path, self._sr)
        if y.size == 0:
            raise RuntimeError("decoded audio is empty")
        # The decoded PCM length is the authoritative duration; the chart must fit inside it.
        duration = float(len(y) / self._sr)

        # #5: ignore leading/trailing silence so the chart spans only the audible region.
        y_trim, lead = _trim_silence(
            y, self._sr, self._silence_top_db, self._silence_min_content_seconds
        )
        trimmed_dur = float(len(y_trim) / self._sr)

        tempo, beat_frames = librosa.beat.beat_track(y=y_trim, sr=self._sr, units="time")
        bpm = float(whole_bpm(float(np.atleast_1d(tempo)[0])) or 0.0)
        beat_times = [float(t) + lead for t in np.atleast_1d(beat_frames)]

        chroma = _chroma_features(y_trim, self._sr, self._hop, self._use_hpss)
        tonic_pc, mode = estimate_key(chroma.mean(axis=1))

        # Tier 1: score every state per frame, then Viterbi-decode the most-likely chord
        # path so a few mistaken frames cannot flip the label (replaces majority voting).
        state_labels, scores = self._recognizer.score(chroma)
        if scores.shape[1] == 0:
            return AnalysisResult(bpm, tonic_pc, mode, duration, [], beat_times=beat_times)
        labels = viterbi_decode(scores, state_labels, self._change_penalty)

        frame_times = librosa.frames_to_time(
            np.arange(len(labels) + 1), sr=self._sr, hop_length=self._hop
        )
        boundaries = [min(float(t), trimmed_dur) for t in frame_times]
        boundaries[0], boundaries[-1] = 0.0, trimmed_dur

        segments = merge_segments(labels, boundaries)
        segments = drop_short_segments(segments, self._min_segment_seconds)
        segments = shift_segments(segments, lead)
        return AnalysisResult(bpm, tonic_pc, mode, duration, segments, beat_times=beat_times)


class ChordinoAnalyzer:
    """Tier 2 analyzer: the Vamp Chordino plugin (NNLS chroma + trained Viterbi).

    Chordino transcribes chords directly from audio with a richer vocabulary than the
    librosa engine; its labels are reduced to Tabit's five qualities. Tempo and key are
    still estimated with librosa. Requires the ``vamp`` module and the nnls-chroma plugin.
    """

    def __init__(
        self,
        sample_rate: int = 22050,
        min_segment_seconds: float = 0.75,
        silence_top_db: float = 30.0,
        silence_min_content_seconds: float = 0.5,
    ) -> None:
        self._sr = sample_rate
        self._min_segment_seconds = min_segment_seconds
        self._silence_top_db = silence_top_db
        self._silence_min_content_seconds = silence_min_content_seconds
        try:
            import vamp
        except ImportError as exc:  # pragma: no cover - env-dependent
            raise RuntimeError(
                "ChordinoAnalyzer needs the 'vamp' module: pip install vamp"
            ) from exc
        if _CHORDINO_PLUGIN not in vamp.list_plugins():  # pragma: no cover - env-dependent
            raise RuntimeError(
                f"Vamp plugin {_CHORDINO_PLUGIN!r} not found; install the Vamp Plugin "
                "Pack (https://www.vamp-plugins.org/pack.html)."
            )

    def analyze(self, audio_path: str) -> AnalysisResult:
        import vamp

        y = decode_to_mono(audio_path, self._sr)
        if y.size == 0:
            raise RuntimeError("decoded audio is empty")
        duration = float(len(y) / self._sr)

        # Ignore leading/trailing silence so beats and chords span only the audible
        # region; everything below is computed on the trimmed audio and shifted back.
        y_trim, lead = _trim_silence(
            y, self._sr, self._silence_top_db, self._silence_min_content_seconds
        )
        trimmed_dur = float(len(y_trim) / self._sr)

        bpm, tonic_pc, mode, beat_times = _tempo_key_beats(y_trim, self._sr, lead)

        result = vamp.collect(y_trim, self._sr, _CHORDINO_PLUGIN)
        entries = result.get("list", []) if isinstance(result, dict) else []
        segments = chordino_segments(entries, trimmed_dur, self._min_segment_seconds)
        segments = shift_segments(segments, lead)
        return AnalysisResult(
            bpm, tonic_pc, mode, duration, segments, CHORDINO_ENGINE_VERSION,
            beat_times=beat_times,
        )


class BTCAnalyzer:
    """Tier 3 analyzer: optional Demucs stem separation -> BTC deep chord model.

    The Phase 0 gate condition, wired for the running app: separate the mix, sum the
    harmonic sources, and transcribe chords from that stem with the pretrained BTC
    transformer (:class:`~app.audio.deep_chord.BTCChordEngine`). With ``separator=None`` the
    model runs on the raw mix instead, which is the A/B control.

    Tempo, key and the beat grid still come from librosa on the mix (the deep model only
    emits chords). Needs the ``[ml]`` extra plus staged BTC weights; both are loaded lazily
    on the first :meth:`analyze`, so a misconfigured engine fails that recording with a clear
    message rather than silently degrading to a weaker one.
    """

    def __init__(
        self,
        sample_rate: int = 22050,
        min_segment_seconds: float = 0.75,
        silence_top_db: float = 30.0,
        silence_min_content_seconds: float = 0.5,
        *,
        device: str = "auto",
        separator: SeparationService | None = None,
        stem: str = "harmonic",
        smooth_window: int = 1,
    ) -> None:
        self._sr = sample_rate
        self._separator = separator
        self._stem = stem
        self._silence_top_db = silence_top_db
        self._silence_min_content_seconds = silence_min_content_seconds
        self._engine = BTCChordEngine(
            device=device,
            smooth_window=smooth_window,
            min_seconds=min_segment_seconds,
        )

    @property
    def engine_version(self) -> str:
        if self._separator is None:
            return BTC_ENGINE_VERSION
        return f"{BTC_ENGINE_VERSION}+demucs-{self._stem}"

    def analyze(self, audio_path: str) -> AnalysisResult:
        y = decode_to_mono(audio_path, self._sr)
        if y.size == 0:
            raise RuntimeError("decoded audio is empty")
        duration = float(len(y) / self._sr)

        # Beat-track the audible region only, then shift the onsets back: a track with a
        # few seconds of lead-in silence would otherwise get a grid anchored in the silence,
        # and every chord's beat count would be off by that offset. The chord segments below
        # come from the untrimmed file and are already in original-audio time.
        y_trim, lead = _trim_silence(
            y, self._sr, self._silence_top_db, self._silence_min_content_seconds
        )
        bpm, tonic_pc, mode, beat_times = _tempo_key_beats(y_trim, self._sr, lead)

        if self._separator is None:
            segments = self._engine.segments(audio_path)
        else:
            # Demucs preserves length, so the stem shares the mix's timeline and the model's
            # segment times need no shifting. WAV keeps the temp write cheap (it is deleted
            # immediately); persisted stems are a Phase 1 concern, see settings.stem_storage.
            with tempfile.TemporaryDirectory(prefix="tabit-stem-") as tmp:
                stem_path = str(Path(tmp) / "stem.wav")
                self._separator.separate_stem_mix(audio_path, stem_path, self._stem)
                segments = self._engine.segments(stem_path)

        return AnalysisResult(
            bpm, tonic_pc, mode, duration, segments, self.engine_version,
            beat_times=beat_times,
        )

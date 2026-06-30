import numpy as np
import pytest

from app.audio.decode import ffmpeg_available

pytest.importorskip("librosa")
pytestmark = pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not installed")

from app.audio.analyzer import AnalysisResult, LibrosaAnalyzer  # noqa: E402


def _chord_block(pcs, sr, seconds, base_hz=261.63):
    t = np.linspace(0.0, seconds, int(sr * seconds), endpoint=False)
    chord = np.zeros_like(t)
    for pc in pcs:
        freq = base_hz * (2 ** (pc / 12))
        for harmonic in (1, 2, 3):
            chord += np.sin(2 * np.pi * freq * harmonic * t) / harmonic
    return chord


def _write_chord_song(path, chord_pitch_classes, sr=22050, seconds_each=2.0, lead_silence=0.0, trail_silence=0.0):
    sf = pytest.importorskip("soundfile")
    blocks = []
    if lead_silence:
        blocks.append(np.zeros(int(sr * lead_silence)))
    for pcs in chord_pitch_classes:
        blocks.append(_chord_block(pcs, sr, seconds_each))
    if trail_silence:
        blocks.append(np.zeros(int(sr * trail_silence)))
    signal = np.concatenate(blocks)
    signal = 0.3 * signal / np.max(np.abs(signal))
    sf.write(str(path), signal, sr)


def test_analyzes_a_two_chord_song(tmp_path):
    path = tmp_path / "song.wav"
    _write_chord_song(path, [(0, 4, 7), (7, 11, 2)])  # C major, then G major

    result = LibrosaAnalyzer().analyze(str(path))

    assert isinstance(result, AnalysisResult)
    assert result.bpm > 0
    assert result.key_mode in ("major", "minor")
    assert result.engine_version == "template-v2"
    assert result.duration == pytest.approx(4.0, abs=0.05)
    roots = {segment.root_pc for segment in result.segments}
    assert 0 in roots  # C detected somewhere
    assert 7 in roots  # G detected somewhere


def test_chart_never_exceeds_audio_duration(tmp_path):
    path = tmp_path / "song.wav"
    _write_chord_song(path, [(0, 4, 7), (7, 11, 2), (9, 0, 4), (5, 9, 0)], seconds_each=2.0)

    result = LibrosaAnalyzer().analyze(str(path))

    assert result.segments
    assert max(s.end_time for s in result.segments) <= result.duration + 1e-6


def test_chord_change_lands_near_the_real_boundary(tmp_path):
    path = tmp_path / "song.wav"
    # One clean change at t=2.0s; the detected boundary must land close to it (#4).
    _write_chord_song(path, [(0, 4, 7), (7, 11, 2)], seconds_each=2.0)

    result = LibrosaAnalyzer().analyze(str(path))

    interior = [s.start_time for s in result.segments[1:]]
    assert interior, "expected at least one chord change"
    assert min(abs(t - 2.0) for t in interior) <= 0.3


def test_leading_and_trailing_silence_is_trimmed(tmp_path):
    path = tmp_path / "song.wav"
    _write_chord_song(path, [(0, 4, 7)], seconds_each=2.0, lead_silence=1.0, trail_silence=1.0)

    result = LibrosaAnalyzer().analyze(str(path))

    assert result.duration == pytest.approx(4.0, abs=0.05)  # full file length preserved
    assert result.segments
    assert result.segments[0].start_time >= 0.7  # chart starts at the first sound, not 0
    assert result.segments[-1].end_time <= 3.3  # and ends before the trailing silence

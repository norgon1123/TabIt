import numpy as np
import pytest

from app.audio.decode import ffmpeg_available

pytest.importorskip("librosa")
pytestmark = pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not installed")

from app.audio.analyzer import AnalysisResult, LibrosaAnalyzer  # noqa: E402


def _write_chord_song(path, chord_pitch_classes, sr=22050, seconds_each=2.0):
    sf = pytest.importorskip("soundfile")
    base_hz = 261.63  # C4
    blocks = []
    for pcs in chord_pitch_classes:
        t = np.linspace(0.0, seconds_each, int(sr * seconds_each), endpoint=False)
        chord = np.zeros_like(t)
        for pc in pcs:
            freq = base_hz * (2 ** (pc / 12))
            for harmonic in (1, 2, 3):
                chord += np.sin(2 * np.pi * freq * harmonic * t) / harmonic
        blocks.append(chord)
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
    assert result.engine_version == "template-v1"
    roots = {segment.root_pc for segment in result.segments}
    assert 0 in roots  # C detected somewhere
    assert 7 in roots  # G detected somewhere

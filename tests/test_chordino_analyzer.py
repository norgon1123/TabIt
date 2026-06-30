import numpy as np
import pytest

from app.audio.decode import ffmpeg_available

vamp = pytest.importorskip("vamp")
pytest.importorskip("librosa")
pytestmark = pytest.mark.skipif(
    not ffmpeg_available() or "nnls-chroma:chordino" not in vamp.list_plugins(),
    reason="ffmpeg or the nnls-chroma:chordino Vamp plugin is not installed",
)

from app.audio.analyzer import AnalysisResult, ChordinoAnalyzer  # noqa: E402


def _write_chord_song(path, chord_pitch_classes, sr=22050, seconds_each=2.0, base_hz=130.81):
    sf = pytest.importorskip("soundfile")
    blocks = []
    for pcs in chord_pitch_classes:
        t = np.linspace(0.0, seconds_each, int(sr * seconds_each), endpoint=False)
        chord = np.zeros_like(t)
        for pc in pcs:
            freq = base_hz * (2 ** (pc / 12))
            for harmonic in (1, 2, 3, 4):
                chord += np.sin(2 * np.pi * freq * harmonic * t) / harmonic
        blocks.append(chord)
    signal = np.concatenate(blocks)
    signal = 0.3 * signal / np.max(np.abs(signal))
    sf.write(str(path), signal, sr)


def test_chordino_detects_a_progression(tmp_path):
    path = tmp_path / "song.wav"
    # C major, G dominant 7th, A minor.
    _write_chord_song(path, [(0, 4, 7), (7, 11, 2, 5), (9, 0, 4)])

    result = ChordinoAnalyzer().analyze(str(path))

    assert isinstance(result, AnalysisResult)
    assert result.engine_version == "chordino-v1"
    assert result.bpm > 0
    assert result.duration == pytest.approx(6.0, abs=0.05)
    chords = {(s.root_pc, s.quality.value) for s in result.segments}
    roots = {root for root, _ in chords}
    assert {0, 7, 9} <= roots  # C, G, and A all detected


def test_chordino_collapses_extensions_to_base(tmp_path):
    path = tmp_path / "addninth.wav"
    # Cadd9 held; Chordino should read it as plain C major (one of the five qualities).
    _write_chord_song(path, [(0, 4, 7, 2)], seconds_each=3.0)

    result = ChordinoAnalyzer().analyze(str(path))

    assert result.segments
    qualities = {s.quality.value for s in result.segments}
    assert qualities <= {"maj", "min", "dom7", "maj7", "min7"}
    assert any(s.root_pc == 0 for s in result.segments)

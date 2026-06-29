import numpy as np
import pytest

from app.audio.recognizer import TemplateChordRecognizer
from app.music_theory import Quality


def _chroma(*pitch_classes: int) -> np.ndarray:
    col = np.zeros((12, 1))
    for pc in pitch_classes:
        col[pc, 0] = 1.0
    return col


def test_detects_major_triad():
    assert TemplateChordRecognizer().recognize(_chroma(0, 4, 7)) == [(0, Quality.MAJ)]


def test_detects_minor_triad():
    assert TemplateChordRecognizer().recognize(_chroma(9, 0, 4)) == [(9, Quality.MIN)]


def test_detects_dominant_seventh():
    assert TemplateChordRecognizer().recognize(_chroma(7, 11, 2, 5)) == [(7, Quality.DOM7)]


def test_detects_major_seventh():
    assert TemplateChordRecognizer().recognize(_chroma(0, 4, 7, 11)) == [(0, Quality.MAJ7)]


def test_detects_minor_seventh():
    assert TemplateChordRecognizer().recognize(_chroma(2, 5, 9, 0)) == [(2, Quality.MIN7)]


def test_handles_multiple_columns():
    chroma = np.hstack([_chroma(0, 4, 7), _chroma(7, 11, 2)])
    assert TemplateChordRecognizer().recognize(chroma) == [(0, Quality.MAJ), (7, Quality.MAJ)]


def test_silent_column_falls_back_to_previous():
    chroma = np.hstack([_chroma(0, 4, 7), np.zeros((12, 1))])
    assert TemplateChordRecognizer().recognize(chroma) == [(0, Quality.MAJ), (0, Quality.MAJ)]


def test_rejects_non_12_row_input():
    with pytest.raises(ValueError):
        TemplateChordRecognizer().recognize(np.zeros((11, 3)))

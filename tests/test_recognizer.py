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


# --- Tier 1: extensions collapse to one of the 5 output qualities --------------

def test_add9_collapses_to_major():
    # Cadd9 = C E G D; should read as plain C major, not flip to a neighbour.
    assert TemplateChordRecognizer().recognize(_chroma(0, 4, 7, 2)) == [(0, Quality.MAJ)]


def test_dominant_ninth_collapses_to_dom7():
    # C9 = C E G Bb D -> C7.
    assert TemplateChordRecognizer().recognize(_chroma(0, 4, 7, 10, 2)) == [(0, Quality.DOM7)]


def test_minor_sixth_collapses_to_minor():
    # Cm6 = C Eb G A -> C minor.
    assert TemplateChordRecognizer().recognize(_chroma(0, 3, 7, 9)) == [(0, Quality.MIN)]


def test_diminished_collapses_to_minor():
    # Cdim shares the minor third; reduce to C minor.
    assert TemplateChordRecognizer().recognize(_chroma(0, 3, 6)) == [(0, Quality.MIN)]


def test_augmented_collapses_to_major_quality():
    # Augmented is symmetric (root ambiguous), but the quality must reduce to major.
    [(root, quality)] = TemplateChordRecognizer().recognize(_chroma(0, 4, 8))
    assert quality == Quality.MAJ
    assert root in (0, 4, 8)


# --- Tier 1: score() exposes per-frame emissions for the Viterbi decoder -------

def test_score_returns_state_matrix():
    rec = TemplateChordRecognizer()
    chroma = np.hstack([_chroma(0, 4, 7), _chroma(7, 11, 2)])
    labels, matrix = rec.score(chroma)
    assert len(labels) == 60  # 5 output qualities x 12 roots
    assert matrix.shape == (60, 2)
    # argmax of each column reproduces recognize()
    argmax_labels = [labels[int(np.argmax(matrix[:, j]))] for j in range(matrix.shape[1])]
    assert argmax_labels == [(0, Quality.MAJ), (7, Quality.MAJ)]


def test_score_rejects_non_12_row_input():
    with pytest.raises(ValueError):
        TemplateChordRecognizer().score(np.zeros((11, 3)))

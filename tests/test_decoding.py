import numpy as np
import pytest

from app.audio.decoding import viterbi_decode
from app.music_theory import Quality

# A tiny 3-state label set for focused tests: C major, G major, A minor.
LABELS = [(0, Quality.MAJ), (7, Quality.MAJ), (9, Quality.MIN)]


def _emissions(winners: list[int], strong: float = 1.0, weak: float = 0.1) -> np.ndarray:
    """Build an (S x N) score matrix where column j favours state winners[j]."""
    matrix = np.full((len(LABELS), len(winners)), weak)
    for j, s in enumerate(winners):
        matrix[s, j] = strong
    return matrix


def test_zero_penalty_reduces_to_argmax():
    winners = [0, 1, 2, 0]
    matrix = _emissions(winners)
    out = viterbi_decode(matrix, LABELS, change_penalty=0.0)
    assert out == [LABELS[s] for s in winners]


def test_corrects_single_wrong_frame():
    # Steady C major with one frame that argmax would call G major.
    winners = [0, 0, 1, 0, 0]
    matrix = _emissions(winners, strong=1.0, weak=0.1)
    out = viterbi_decode(matrix, LABELS, change_penalty=2.0)
    assert out == [LABELS[0]] * 5  # the lone G frame is absorbed


def test_preserves_genuine_sustained_change():
    # A real change: four frames of C then four of A minor.
    winners = [0, 0, 0, 0, 2, 2, 2, 2]
    matrix = _emissions(winners, strong=1.0, weak=0.1)
    out = viterbi_decode(matrix, LABELS, change_penalty=2.0)
    assert out == [LABELS[0]] * 4 + [LABELS[2]] * 4


def test_high_penalty_locks_single_chord():
    # With a punishing penalty, brief excursions never survive.
    winners = [0, 1, 0, 1, 0]
    matrix = _emissions(winners, strong=1.0, weak=0.1)
    out = viterbi_decode(matrix, LABELS, change_penalty=100.0)
    assert len(set(out)) == 1


def test_single_frame():
    matrix = _emissions([2])
    assert viterbi_decode(matrix, LABELS, change_penalty=2.0) == [LABELS[2]]


def test_empty_matrix_returns_empty():
    matrix = np.zeros((len(LABELS), 0))
    assert viterbi_decode(matrix, LABELS, change_penalty=2.0) == []


def test_rejects_label_count_mismatch():
    matrix = np.zeros((len(LABELS) + 1, 3))
    with pytest.raises(ValueError):
        viterbi_decode(matrix, LABELS, change_penalty=2.0)

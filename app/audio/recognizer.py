"""Chord recognition from chroma vectors.

v3: extension-tolerant cosine template matching. The internal template bank is wider
than the output vocabulary (it knows sus/6/9/dim/aug shapes) so an extended chord lifts
the score of its base triad/seventh instead of corrupting it into a wrong neighbour.
Every internal template still *reduces* to one of the five output qualities, so the
emitted vocabulary is unchanged. ``score`` exposes per-frame, per-state emissions for the
Viterbi decoder; ``recognize`` is the argmax convenience wrapper.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np

from app.music_theory import Quality

# Internal templates: (semitone offsets from the root, output quality it reduces to).
# Extensions map down to the nearest of the five output qualities (see the design spec):
# sus/6/add9/aug keep the major third (-> maj); dim/min6 keep the minor third (-> min);
# the ninth chords reduce to their parent seventh.
_INTERNAL_TEMPLATES: tuple[tuple[tuple[int, ...], Quality], ...] = (
    ((0, 4, 7), Quality.MAJ),
    ((0, 3, 7), Quality.MIN),
    ((0, 4, 7, 10), Quality.DOM7),
    ((0, 4, 7, 11), Quality.MAJ7),
    ((0, 3, 7, 10), Quality.MIN7),
    ((0, 2, 7), Quality.MAJ),          # sus2
    ((0, 5, 7), Quality.MAJ),          # sus4
    ((0, 4, 7, 9), Quality.MAJ),       # 6
    ((0, 4, 7, 2), Quality.MAJ),       # add9
    ((0, 4, 7, 11, 2), Quality.MAJ7),  # maj9
    ((0, 4, 7, 10, 2), Quality.DOM7),  # dom9
    ((0, 3, 7, 9), Quality.MIN),       # min6
    ((0, 3, 7, 10, 2), Quality.MIN7),  # min9
    ((0, 3, 6), Quality.MIN),          # dim
    ((0, 4, 8), Quality.MAJ),          # aug
)

# Output states: the 5 qualities x 12 roots, in a stable order (quality, then root).
_OUTPUT_QUALITIES: tuple[Quality, ...] = (
    Quality.MAJ,
    Quality.MIN,
    Quality.DOM7,
    Quality.MAJ7,
    Quality.MIN7,
)

# The first five internal templates are the plain triads/sevenths (the output qualities).
_N_BASE_TEMPLATES = len(_OUTPUT_QUALITIES)

# Tie-break bonus added to the base templates so the simplest interpretation wins exact
# ties (e.g. Dm7 vs the enharmonically identical F6 -> read as Dm7). Tiny enough that it
# never overrides a genuinely closer match.
_BASE_BONUS = 1e-3


def _build() -> tuple[np.ndarray, np.ndarray, np.ndarray, list[tuple[int, Quality]]]:
    """Return internal templates, their tie-break bonus, state indices, and state labels.

    - templates: (R x 12) unit-norm rows, one per (internal template, root).
    - bonus: (R,) additive tie-break bonus, non-zero only for the base templates.
    - state_idx: (R,) the output-state index each template row reduces to.
    - labels: the S output states as (root_pc, quality), S = 60.
    """
    state_index: dict[tuple[int, Quality], int] = {}
    labels: list[tuple[int, Quality]] = []
    for quality in _OUTPUT_QUALITIES:
        for root in range(12):
            state_index[(root, quality)] = len(labels)
            labels.append((root, quality))

    rows: list[np.ndarray] = []
    bonus: list[float] = []
    state_idx: list[int] = []
    for i, (offsets, quality) in enumerate(_INTERNAL_TEMPLATES):
        is_base = i < _N_BASE_TEMPLATES
        for root in range(12):
            vec = np.zeros(12, dtype=float)
            for offset in offsets:
                vec[(root + offset) % 12] = 1.0
            rows.append(vec / np.linalg.norm(vec))
            bonus.append(_BASE_BONUS if is_base else 0.0)
            state_idx.append(state_index[(root, quality)])
    return (
        np.vstack(rows),
        np.asarray(bonus, dtype=float),
        np.asarray(state_idx, dtype=int),
        labels,
    )


class ChordRecognizer(Protocol):
    def recognize(self, chroma: np.ndarray) -> list[tuple[int, Quality]]:
        """Label each chroma column (shape 12 x N) with a (root_pc, quality)."""
        ...

    def score(self, chroma: np.ndarray) -> tuple[list[tuple[int, Quality]], np.ndarray]:
        """Return the output-state labels and an (S x N) per-frame emission matrix."""
        ...


class TemplateChordRecognizer:
    """Score each chroma column against the internal template bank, reduced to 5 qualities."""

    def __init__(self) -> None:
        self._templates, self._bonus, self._state_idx, self._labels = _build()
        self._n_states = len(self._labels)

    def score(self, chroma: np.ndarray) -> tuple[list[tuple[int, Quality]], np.ndarray]:
        if chroma.shape[0] != 12:
            raise ValueError("chroma must have 12 rows (one per pitch class)")
        norms = np.linalg.norm(chroma, axis=0)
        safe = np.where(norms == 0.0, 1.0, norms)
        unit = chroma / safe  # silent columns become all-zero -> zero emissions
        internal = self._templates @ unit  # (R x N) cosine per internal template
        # Tie-break toward the base templates, but only where they actually overlap.
        internal = internal + self._bonus[:, None] * (internal > 0.0)
        # Per output state, keep the best-matching internal template for the frame.
        matrix = np.zeros((self._n_states, chroma.shape[1]), dtype=float)
        np.maximum.at(matrix, self._state_idx, internal)
        return list(self._labels), matrix

    def recognize(self, chroma: np.ndarray) -> list[tuple[int, Quality]]:
        labels, matrix = self.score(chroma)
        norms = np.linalg.norm(chroma, axis=0)
        results: list[tuple[int, Quality]] = []
        for column, norm in zip(matrix.T, norms):
            if norm == 0.0:
                # Silent frame: hold the previous chord, or default to C major.
                results.append(results[-1] if results else (0, Quality.MAJ))
                continue
            results.append(labels[int(np.argmax(column))])
        return results

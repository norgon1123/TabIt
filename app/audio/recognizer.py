"""Chord recognition from chroma vectors. v1: cosine template matching (no ML)."""

from __future__ import annotations

from typing import Protocol

import numpy as np

from app.music_theory import Quality

# Semitone offsets from the root for each supported chord quality.
_TEMPLATE_OFFSETS: dict[Quality, tuple[int, ...]] = {
    Quality.MAJ: (0, 4, 7),
    Quality.MIN: (0, 3, 7),
    Quality.DOM7: (0, 4, 7, 10),
    Quality.MAJ7: (0, 4, 7, 11),
    Quality.MIN7: (0, 3, 7, 10),
}


def _build_templates() -> tuple[np.ndarray, list[tuple[int, Quality]]]:
    """Return unit-norm templates (rows x 12) and the (root_pc, quality) label per row."""
    rows: list[np.ndarray] = []
    labels: list[tuple[int, Quality]] = []
    for quality, offsets in _TEMPLATE_OFFSETS.items():
        for root in range(12):
            vec = np.zeros(12, dtype=float)
            for offset in offsets:
                vec[(root + offset) % 12] = 1.0
            rows.append(vec / np.linalg.norm(vec))
            labels.append((root, quality))
    return np.vstack(rows), labels


class ChordRecognizer(Protocol):
    def recognize(self, chroma: np.ndarray) -> list[tuple[int, Quality]]:
        """Label each chroma column (shape 12 x N) with a (root_pc, quality)."""
        ...


class TemplateChordRecognizer:
    """Pick, per chroma column, the chord template with the highest cosine similarity."""

    def __init__(self) -> None:
        self._templates, self._labels = _build_templates()

    def recognize(self, chroma: np.ndarray) -> list[tuple[int, Quality]]:
        if chroma.shape[0] != 12:
            raise ValueError("chroma must have 12 rows (one per pitch class)")
        results: list[tuple[int, Quality]] = []
        for column in chroma.T:
            norm = np.linalg.norm(column)
            if norm == 0:
                # Silent frame: hold the previous chord, or default to C major.
                results.append(results[-1] if results else (0, Quality.MAJ))
                continue
            scores = self._templates @ (column / norm)
            results.append(self._labels[int(np.argmax(scores))])
        return results

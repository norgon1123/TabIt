"""Krumhansl-Schmuckler key estimation from an averaged chromagram."""

from __future__ import annotations

import numpy as np

# Krumhansl-Kessler tonal hierarchy profiles (index 0 == tonic).
_MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


def estimate_key(chroma_mean: np.ndarray) -> tuple[int, str]:
    """Return (tonic_pitch_class, mode) best matching a length-12 mean chroma vector."""
    if chroma_mean.shape != (12,):
        raise ValueError("chroma_mean must be a length-12 vector")
    if np.std(chroma_mean) == 0:
        return (0, "major")
    best_score = -np.inf
    best: tuple[int, str] = (0, "major")
    for tonic in range(12):
        for mode, profile in (("major", _MAJOR_PROFILE), ("minor", _MINOR_PROFILE)):
            score = float(np.corrcoef(chroma_mean, np.roll(profile, tonic))[0, 1])
            if score > best_score:
                best_score = score
                best = (tonic, mode)
    return best

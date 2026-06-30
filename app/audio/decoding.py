"""Viterbi chord decoding.

Turns a per-frame emission matrix (chord-state scores) into a single most-likely chord
path. A flat ``change_penalty`` is charged whenever the path switches state, so a handful
of mistaken frames cannot flip the label while a genuinely sustained change still wins.
This replaces the old majority-vote smoothing.
"""

from __future__ import annotations

import numpy as np

from app.music_theory import Quality


def viterbi_decode(
    score_matrix: np.ndarray,
    labels: list[tuple[int, Quality]],
    change_penalty: float,
) -> list[tuple[int, Quality]]:
    """Decode the most-likely chord path from an (S x N) emission matrix.

    ``score_matrix[s, j]`` is the score of state ``labels[s]`` at frame ``j``. Staying in
    a state is free; moving to any other state costs ``change_penalty``. Returns one label
    per frame (length N).
    """
    if score_matrix.shape[0] != len(labels):
        raise ValueError("score_matrix rows must match the number of labels")
    n_states, n_frames = score_matrix.shape
    if n_frames == 0:
        return []

    # dp[s] = best cumulative score of a path ending in state s at the current frame.
    dp = score_matrix[:, 0].astype(float).copy()
    back = np.empty((n_states, n_frames), dtype=int)
    back[:, 0] = -1

    for j in range(1, n_frames):
        best_prev = int(np.argmax(dp))
        best_val = dp[best_prev]
        change_val = best_val - change_penalty
        # For each target state: stay (free) vs. switch from the global best (penalised).
        stay_better = dp >= change_val
        back[:, j] = np.where(stay_better, np.arange(n_states), best_prev)
        dp = score_matrix[:, j] + np.where(stay_better, dp, change_val)

    # Backtrack from the best final state.
    path = [0] * n_frames
    state = int(np.argmax(dp))
    for j in range(n_frames - 1, -1, -1):
        path[j] = state
        state = back[state, j]
    return [labels[s] for s in path]

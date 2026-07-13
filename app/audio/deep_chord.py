"""Deep chord-recognition engine seam (Phase 0 spike 0.3).

The go/no-go gate compares a *trained* chord model against the current heuristic engine.
This module defines the small interface the eval harness drives — ``segments(path) ->
list[DetectedSegment]`` — and holds the BTC-class adapter.

The model is **not swappable** (see the risk table in the technical plan): if it won't run
that is an environment problem to solve on the pinned/containerized inference box, not a
reason to substitute a weaker recognizer. The adapter wraps the vendored BTC-ISMIR19
inference code (``vendor/btc/``) and its pretrained weights (staged out of band, see
``vendor/btc/README.md``). Heavy imports (torch, the vendored modules) are lazy so this
module stays importable without the ``[ml]`` extra or the weights present.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Protocol

from app.audio.device import resolve_device
from app.audio.segments import DetectedSegment, drop_short_segments
from app.music_theory import Quality, note_to_pitch_class

# vendor/btc lives at the repo root: app/audio/deep_chord.py -> parents[2] is the root.
_VENDOR_BTC = Path(__file__).resolve().parents[2] / "vendor" / "btc"


class ChordEngine(Protocol):
    """Anything the eval harness can score: audio path -> detected chord segments."""

    def segments(self, audio_path: str) -> list[DetectedSegment]: ...


# --- Vocabulary mapping: BTC (Harte) labels -> Tabit's five qualities ----------------
#
# BTC's large-voca head emits mir_eval/Harte labels like "C:maj", "A:min7", "G:7",
# "F#:hdim7", "Bb:maj/3" (with a slash bass), plus "N" (no chord) and "X" (unknown). Every
# engine the harness scores collapses to the same five output qualities so the WCSR
# comparison is apples-to-apples; this mirrors ``chordino.py::_reduce_suffix`` but keyed on
# Harte shorthand rather than chord-symbol suffixes.

# Root token before the ':'; the rest is the shorthand (+ optional '/bass').
_BTC_LABEL = re.compile(r"^([A-G][#b]?)(?::(.*))?$")

_SHORTHAND_TO_QUALITY: dict[str, Quality] = {
    "": Quality.MAJ, "maj": Quality.MAJ, "maj6": Quality.MAJ, "6": Quality.MAJ,
    "sus2": Quality.MAJ, "sus4": Quality.MAJ, "aug": Quality.MAJ,
    "min": Quality.MIN, "min6": Quality.MIN, "dim": Quality.MIN,
    "hdim7": Quality.MIN, "dim7": Quality.MIN,
    "7": Quality.DOM7, "9": Quality.DOM7,
    "maj7": Quality.MAJ7, "maj9": Quality.MAJ7,
    "min7": Quality.MIN7, "min9": Quality.MIN7, "minmaj7": Quality.MIN7,
}


def _reduce_shorthand(shorthand: str) -> Quality:
    """Map any Harte shorthand to one of the five output qualities (heuristic fallback)."""
    if shorthand in _SHORTHAND_TO_QUALITY:
        return _SHORTHAND_TO_QUALITY[shorthand]
    low = shorthand.lower()
    has_seventh = any(d in low for d in ("7", "9", "11", "13"))
    if low.startswith("maj"):
        return Quality.MAJ7 if has_seventh else Quality.MAJ
    if low.startswith("min") or low.startswith("m"):
        return Quality.MIN7 if has_seventh else Quality.MIN
    if low.startswith("dim") or low.startswith("hdim"):
        return Quality.MIN
    if low.startswith("aug") or low.startswith("sus"):
        return Quality.MAJ
    return Quality.DOM7 if has_seventh else Quality.MAJ


def reduce_btc_label(label: str) -> tuple[int, Quality] | None:
    """Parse a BTC/Harte label to (root_pc, quality); None for no-chord/unparseable.

    ``"N"``/``"X"`` (no-chord / unknown) and anything without a valid root return None so
    the caller renders that span as a gap (scored as no-chord), matching Chordino's "N"
    handling.
    """
    token = label.strip()
    if not token or token in ("N", "X"):
        return None
    match = _BTC_LABEL.match(token)
    if match is None:
        return None
    root_name, shorthand = match.group(1), (match.group(2) or "")
    shorthand = shorthand.split("/", 1)[0]  # drop the slash bass note
    return note_to_pitch_class(root_name), _reduce_shorthand(shorthand)


def frames_to_segments(
    frame_labels: list[tuple[int, Quality] | None],
    hop_seconds: float,
    *,
    smooth_window: int = 1,
    min_seconds: float = 0.0,
) -> list[DetectedSegment]:
    """Collapse per-frame chord labels into timed segments over a fixed frame grid.

    ``frame_labels[i]`` covers ``[i*hop, (i+1)*hop)``; ``None`` marks a no-chord/unknown
    frame (dropped, becoming a gap the eval scores as ``N``). ``smooth_window`` majority-
    votes each frame against its neighbours to kill single-frame jitter before grouping;
    ``min_seconds`` absorbs sub-threshold chord segments into a neighbour. This is the
    model-independent half of :meth:`BTCChordEngine.segments`, unit-testable without weights.
    """
    if hop_seconds <= 0:
        raise ValueError("hop_seconds must be positive")
    labels = _majority_smooth(frame_labels, smooth_window)
    raw: list[DetectedSegment] = []
    i, n = 0, len(labels)
    while i < n:
        j = i
        while j < n and labels[j] == labels[i]:
            j += 1
        lab = labels[i]
        if lab is not None:
            root_pc, quality = lab
            raw.append(DetectedSegment(i * hop_seconds, j * hop_seconds, root_pc, quality))
        i = j
    if not raw:
        return []
    return drop_short_segments(raw, min_seconds) if min_seconds > 0 else raw


def _majority_smooth(
    labels: list[tuple[int, Quality] | None], window: int
) -> list[tuple[int, Quality] | None]:
    """Majority-vote each label against its window neighbours (no-chord ``None`` included).

    Like ``segments.smooth_labels`` but tolerant of ``None`` frames, so a chord flanked by
    no-chord jitter (or vice versa) resolves cleanly. Ties break toward the frame's own
    label so a genuine change is never erased.
    """
    if window <= 1 or len(labels) <= 1:
        return list(labels)
    half = window // 2
    out: list[tuple[int, Quality] | None] = []
    for i in range(len(labels)):
        lo, hi = max(0, i - half), min(len(labels), i + half + 1)
        counts: dict[tuple[int, Quality] | None, int] = {}
        for label in labels[lo:hi]:
            counts[label] = counts.get(label, 0) + 1
        out.append(max(counts, key=lambda lab: (counts[lab], lab == labels[i])))
    return out


class BTCChordEngine:
    """Adapter for a BTC-class bidirectional-transformer chord model (inference only).

    Port checklist (do on the inference box, torch 2.11+cu130 / py3.14 — see findings log):
      1. Vendor/pin the BTC inference code + config; stage pretrained weights out of band
         (they are not committed here).
      2. Load the model onto ``resolve_device(...)``; compute the model's expected input
         (CQT per its ``run_config.yaml``) from the decoded mono audio.
      3. Decode the frame-wise posterior to per-frame ``(root_pc, Quality)`` via
         :func:`reduce_btc_label`, then hand them to :func:`frames_to_segments` (with the
         model's frame hop) to get merged ``DetectedSegment``s. *(Done — pure, tested.)*
      4. Confirm it imports and runs on the 5070 Ti under the pinned stack (the hard
         feasibility gate).

    Steps 1/2/4 need the model + weights on the box; step 3's mapping is implemented and
    unit-tested (:mod:`tests.test_deep_chord`), so wiring is: featurize -> logits ->
    argmax -> label strings -> ``reduce_btc_label`` -> ``frames_to_segments``.
    """

    def __init__(
        self,
        device: str = "auto",
        weights_path: str | None = None,
        *,
        large_voca: bool = True,
        smooth_window: int = 1,
        min_seconds: float = 0.0,
    ) -> None:
        # large_voca=True selects the 170-chord head (richer vocabulary the gate wants to
        # show is usable); False is the 25-class maj/min head. smooth_window / min_seconds
        # default to a faithful reproduction of upstream's raw frame output (no smoothing).
        self._device_pref = device
        self._weights_path = weights_path
        self._large_voca = large_voca
        self._smooth_window = smooth_window
        self._min_seconds = min_seconds
        self._loaded = False  # populated by _ensure_loaded()

    def _ensure_loaded(self) -> None:
        """Load config, model, weights, and vocabulary once (lazy — needs [ml] + weights)."""
        if self._loaded:
            return
        import sys

        import torch

        if str(_VENDOR_BTC) not in sys.path:
            sys.path.insert(0, str(_VENDOR_BTC))  # let the vendored code import as upstream
        try:
            from btc_model import BTC_model
            from utils.hparams import HParams
            from utils.mir_eval_modules import (
                audio_file_to_features,
                idx2chord,
                idx2voca_chord,
            )
        except ImportError as exc:  # pragma: no cover - env-dependent
            raise RuntimeError(
                "BTCChordEngine needs the '[ml]' extra (torch/librosa) and the vendored "
                "code under vendor/btc/; see vendor/btc/README.md."
            ) from exc

        config = HParams.load(str(_VENDOR_BTC / "run_config.yaml"))
        if self._large_voca:
            config.feature["large_voca"] = True
            config.model["num_chords"] = 170
            idx_to_chord = idx2voca_chord()
            default_weights = _VENDOR_BTC / "weights" / "btc_model_large_voca.pt"
        else:
            config.model["num_chords"] = 25
            idx_to_chord = idx2chord
            default_weights = _VENDOR_BTC / "weights" / "btc_model.pt"

        weights = Path(self._weights_path) if self._weights_path else default_weights
        if not weights.exists():
            raise RuntimeError(
                f"BTC weights not found at {weights}. Stage the pretrained checkpoint there "
                "(see vendor/btc/README.md) or pass weights_path=."
            )

        device = resolve_device(self._device_pref)
        model = BTC_model(config=config.model).to(device)
        # weights_only=False: these checkpoints carry the numpy mean/std alongside the state
        # dict, and torch>=2.6 defaults weights_only=True (which would reject them).
        checkpoint = torch.load(str(weights), map_location=device, weights_only=False)
        self._mean = checkpoint["mean"]
        self._std = checkpoint["std"]
        model.load_state_dict(checkpoint["model"])
        model.eval()

        self._model = model
        self._config = config
        self._idx_to_chord = idx_to_chord
        self._device = device
        self._featurize = audio_file_to_features
        self._n_timestep = int(config.model["timestep"])
        self._loaded = True

    def _frame_indices(self, audio_path: str) -> tuple[list[int], float]:
        """Run the model, returning per-frame chord indices + the frame period (seconds).

        Reproduces the upstream ``test.py`` featurize→normalize→pad→windowed-inference loop
        verbatim (that path is what the pretrained weights were validated against).
        """
        import numpy as np
        import torch

        feature, feature_per_second, _ = self._featurize(audio_path, self._config)
        feature = feature.T  # (frames, feature_size)
        feature = (feature - self._mean) / self._std
        n_frames = feature.shape[0]

        n_timestep = self._n_timestep
        num_pad = n_timestep - (n_frames % n_timestep)
        feature = np.pad(feature, ((0, num_pad), (0, 0)), mode="constant", constant_values=0)
        num_instance = feature.shape[0] // n_timestep

        indices: list[int] = []
        with torch.no_grad():
            tensor = torch.tensor(feature, dtype=torch.float32).unsqueeze(0).to(self._device)
            for t in range(num_instance):
                window = tensor[:, n_timestep * t : n_timestep * (t + 1), :]
                encoded, _ = self._model.self_attn_layers(window)
                prediction, _ = self._model.output_layer(encoded)
                indices.extend(int(x) for x in prediction.squeeze().cpu().tolist())
        return indices[:n_frames], feature_per_second  # drop the padding frames

    def segments(self, audio_path: str) -> list[DetectedSegment]:
        self._ensure_loaded()
        indices, hop_seconds = self._frame_indices(audio_path)
        frame_labels = [reduce_btc_label(self._idx_to_chord[i]) for i in indices]
        return frames_to_segments(
            frame_labels,
            hop_seconds,
            smooth_window=self._smooth_window,
            min_seconds=self._min_seconds,
        )

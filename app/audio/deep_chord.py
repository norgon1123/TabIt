"""Deep chord-recognition engine seam (Phase 0 spike 0.3).

The go/no-go gate compares a *trained* chord model against the current heuristic engine.
This module defines the small interface the eval harness drives — ``segments(path) ->
list[DetectedSegment]`` — and holds the BTC-class adapter.

The model is **not swappable** (see the risk table in the technical plan): if it won't run
that is an environment problem to solve on the pinned/containerized inference box, not a
reason to substitute a weaker recognizer. The adapter is intentionally unimplemented here
because it requires the ``[ml]`` extra *and* pretrained weights that are fetched/staged on
the GPU box, not committed to the repo. Wiring it up is the concrete next task once the
inference environment is stood up.
"""

from __future__ import annotations

from typing import Protocol

from app.audio.segments import DetectedSegment


class ChordEngine(Protocol):
    """Anything the eval harness can score: audio path -> detected chord segments."""

    def segments(self, audio_path: str) -> list[DetectedSegment]: ...


class BTCChordEngine:
    """Adapter for a BTC-class bidirectional-transformer chord model (inference only).

    Port checklist (do on the inference box, Python ≈3.12 + cu128 torch):
      1. Vendor/pin the BTC inference code + config; stage pretrained weights out of band
         (they are not committed here).
      2. Load the model onto ``resolve_device(...)``; compute the model's expected input
         (CQT/log-mel per its config) from the decoded mono audio.
      3. Decode the frame-wise posterior to chord labels; map its vocabulary onto Tabit's
         (root_pc, Quality) space and merge into ``DetectedSegment``s (reuse
         ``app.audio.segments.merge_segments``).
      4. Confirm it imports and runs on the 5070 Ti under the pinned stack (the hard
         feasibility gate).
    """

    def __init__(self, device: str = "auto", weights_path: str | None = None) -> None:
        self._device = device
        self._weights_path = weights_path

    def segments(self, audio_path: str) -> list[DetectedSegment]:
        raise NotImplementedError(
            "BTCChordEngine is not wired up yet. It requires the '[ml]' extra plus "
            "pretrained weights staged on the inference box; see the port checklist in "
            "app/audio/deep_chord.py and docs/technical-plan-phase-0-1.md (spike 0.3)."
        )

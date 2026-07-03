"""Resolve the torch compute device from config.

Kept tiny and torch-optional: ``torch`` lives in the ``[ml]`` extra, so the import is
lazy and ``resolve_device`` degrades to ``"cpu"`` when torch isn't installed. This is the
single place the pipeline decides cuda/mps/cpu, matching ``TABIT_ANALYSIS_DEVICE``.
"""

from __future__ import annotations

_VALID = {"auto", "cuda", "mps", "cpu"}


def resolve_device(preference: str = "auto") -> str:
    """Return a concrete device string ("cuda" | "mps" | "cpu").

    ``preference`` is one of ``_VALID``. "auto" probes torch for CUDA, then Apple MPS,
    then falls back to CPU. An explicit device is returned verbatim (the caller opted in;
    torch will raise later if it isn't actually available). Unknown values raise.
    """
    pref = (preference or "auto").lower()
    if pref not in _VALID:
        raise ValueError(
            f"invalid device {preference!r}; expected one of {sorted(_VALID)}"
        )
    if pref != "auto":
        return pref
    try:
        import torch
    except ImportError:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"

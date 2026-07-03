"""Source separation via Demucs — the foundation layer of the multi-instrument pipeline.

Wraps ``demucs.api`` to split a recording into instrument stems. In Phase 0 this is the
0.2 separation spike; in Phase 1 the same service backs the separation job stage. Demucs
lives in the ``[ml]`` extra, so it is imported lazily and this module is importable
without it — construction is cheap and only :meth:`separate`/:meth:`separate_to_files`
require the dependency (mirrors :class:`ChordinoAnalyzer`).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.audio.device import resolve_device

# htdemucs_6s is the only 6-source model; it adds dedicated guitar and piano stems on top
# of the usual vocals/drums/bass/other. Piano is known-weak — treat it as best-effort.
DEFAULT_MODEL = "htdemucs_6s"


@dataclass(frozen=True)
class SeparationResult:
    stems: dict[str, "object"]  # instrument -> torch.Tensor (channels x samples)
    samplerate: int
    model: str
    device: str


class SeparationService:
    """Separate audio into instrument stems with Demucs."""

    def __init__(self, model: str = DEFAULT_MODEL, device: str = "auto") -> None:
        self._model = model
        self._device_pref = device
        self._separator = None  # lazily built on first use

    @staticmethod
    def _import_api():
        try:
            import demucs.api as api
        except ImportError as exc:  # pragma: no cover - env-dependent
            raise RuntimeError(
                "SeparationService needs Demucs: pip install -e \".[ml]\""
            ) from exc
        return api

    def _get_separator(self):
        if self._separator is None:
            api = self._import_api()
            device = resolve_device(self._device_pref)
            self._separator = api.Separator(model=self._model, device=device)
            self._resolved_device = device
        return self._separator

    def separate(self, audio_path: str) -> SeparationResult:
        """Return the separated stems as in-memory tensors."""
        separator = self._get_separator()
        _origin, stems = separator.separate_audio_file(audio_path)
        return SeparationResult(
            stems=stems,
            samplerate=separator.samplerate,
            model=self._model,
            device=self._resolved_device,
        )

    def separate_to_files(
        self, audio_path: str, out_dir: str, fmt: str = "flac"
    ) -> dict[str, str]:
        """Separate and write each stem to ``out_dir`` as ``<instrument>.<fmt>``.

        FLAC by default: separation is the expensive step and lossy re-encoding would add
        artifacts that hurt downstream chord/tab analysis (see the stem-storage decision
        in docs/technical-plan-phase-0-1.md). Returns instrument -> written path.
        """
        api = self._import_api()
        result = self.separate(audio_path)
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        written: dict[str, str] = {}
        for instrument, tensor in result.stems.items():
            path = out / f"{instrument}.{fmt}"
            api.save_audio(tensor, str(path), samplerate=result.samplerate)
            written[instrument] = str(path)
        return written

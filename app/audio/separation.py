"""Source separation via Demucs — the foundation layer of the multi-instrument pipeline.

Splits a recording into instrument stems. In Phase 0 this is the 0.2 separation spike; in
Phase 1 the same service backs the separation job stage. Demucs lives in the ``[ml]``
extra, so it is imported lazily and this module is importable without it — construction is
cheap and only :meth:`separate`/:meth:`separate_to_files` require the dependency (mirrors
:class:`ChordinoAnalyzer`).

Implementation note: the published ``demucs==4.0.x`` PyPI wheel does **not** ship the
``demucs.api`` convenience wrapper (that lives only on the git ``main`` branch). To keep
the ``[ml]`` extra installable from a released wheel — and avoid the git-dependency
repo-rot risk called out in the technical plan — this service drives the stable, released
API directly: :func:`demucs.pretrained.get_model` + :func:`demucs.apply.apply_model`,
replicating the demucs CLI's standardize-then-restore normalization so stem amplitudes
match the reference implementation.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.audio.device import resolve_device

# htdemucs_6s is the only 6-source model; it adds dedicated guitar and piano stems on top
# of the usual drums/bass/other/vocals. Piano is known-weak — treat it as best-effort.
DEFAULT_MODEL = "htdemucs_6s"


@dataclass(frozen=True)
class SeparationResult:
    stems: dict[str, "object"]  # instrument -> torch.Tensor (channels x samples), on CPU
    samplerate: int
    model: str
    device: str


class SeparationService:
    """Separate audio into instrument stems with Demucs."""

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        device: str = "auto",
        *,
        shifts: int = 1,
        overlap: float = 0.25,
    ) -> None:
        self._model_name = model
        self._device_pref = device
        # shifts>1 trades wall-clock for a small quality gain (Demucs "shift trick");
        # 1 matches the CLI default and the Phase 0 timing budget.
        self._shifts = shifts
        self._overlap = overlap
        self._model = None  # lazily loaded on first use
        self._resolved_device: str | None = None

    @staticmethod
    def _import_demucs():
        try:
            from demucs.apply import apply_model
            from demucs.audio import AudioFile
            from demucs.pretrained import get_model
        except ImportError as exc:  # pragma: no cover - env-dependent
            raise RuntimeError(
                "SeparationService needs Demucs: pip install -e \".[ml]\""
            ) from exc
        return get_model, apply_model, AudioFile

    def _get_model(self):
        if self._model is None:
            get_model, _, _ = self._import_demucs()
            device = resolve_device(self._device_pref)
            model = get_model(self._model_name)
            model.to(device).eval()
            self._model = model
            self._resolved_device = device
        return self._model

    def separate(self, audio_path: str) -> SeparationResult:
        """Return the separated stems as in-memory CPU tensors (instrument -> tensor)."""
        import torch

        _, apply_model, AudioFile = self._import_demucs()
        model = self._get_model()
        device = self._resolved_device

        wav = AudioFile(audio_path).read(
            streams=0, samplerate=model.samplerate, channels=model.audio_channels
        )
        # Standardize on the mono reference, restore afterwards — verbatim from the demucs
        # CLI so stem levels match the reference separator.
        ref = wav.mean(0)
        mean, std = ref.mean(), ref.std() + 1e-8
        wav = (wav - mean) / std
        with torch.no_grad():
            out = apply_model(
                model,
                wav[None].to(device),
                shifts=self._shifts,
                overlap=self._overlap,
                device=device,
                progress=False,
            )[0]
        out = out * std + mean
        stems = {name: out[i].cpu() for i, name in enumerate(model.sources)}
        return SeparationResult(
            stems=stems,
            samplerate=model.samplerate,
            model=self._model_name,
            device=device,
        )

    def separate_to_files(
        self, audio_path: str, out_dir: str, fmt: str = "flac"
    ) -> dict[str, str]:
        """Separate and write each stem to ``out_dir`` as ``<instrument>.<fmt>``.

        FLAC by default: separation is the expensive step and lossy re-encoding would add
        artifacts that hurt downstream chord/tab analysis (see the stem-storage decision
        in docs/technical-plan-phase-0-1.md). Returns instrument -> written path.

        Written with ``soundfile`` (libsndfile) rather than ``demucs.save_audio`` /
        ``torchaudio.save``: torchaudio 2.11 delegated its file I/O to an optional
        ``torchcodec`` package, so writing through it would add a fragile extra dependency
        for no benefit — libsndfile handles FLAC natively.
        """
        import soundfile as sf

        result = self.separate(audio_path)
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        subtype = "PCM_24" if fmt.lower() == "flac" else None
        written: dict[str, str] = {}
        for instrument, tensor in result.stems.items():
            path = out / f"{instrument}.{fmt}"
            # soundfile wants (frames, channels); demucs tensors are (channels, samples).
            data = tensor.numpy().T
            # Guard against inter-sample peaks >1 (separation can overshoot) clipping on
            # the integer encode, without rescaling in-range audio.
            peak = float(max(abs(data.min()), abs(data.max()), 1.0))
            sf.write(str(path), data / peak, result.samplerate, subtype=subtype)
            written[instrument] = str(path)
        return written

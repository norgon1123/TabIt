#!/usr/bin/env python
"""Demucs separation spike (Phase 0, spike 0.2).

Separates one or more recordings into stems, writing them out and reporting per-song
wall-clock, real-time factor, and (on CUDA) peak VRAM — the numbers the go/no-go gate's
cost/latency half needs from the 5070 Ti. Run the same script on the dev Mac (MPS/CPU)
for the iteration loop.

    python scripts/separation_spike.py path/to/song.m4a --out-dir /tmp/stems

Needs the ``[ml]`` extra (Demucs). The first run downloads the model weights.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.audio.device import resolve_device  # noqa: E402
from app.audio.separation import DEFAULT_MODEL, SeparationService  # noqa: E402


def _audio_duration(path: str) -> float:
    from app.audio.decode import decode_to_mono

    from app.config import get_settings

    sr = get_settings().analysis_sample_rate
    return len(decode_to_mono(path, sr)) / sr


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("audio", nargs="+", help="audio file(s) to separate")
    ap.add_argument("--out-dir", default="./stems", help="root output dir")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--device", default="auto", help="auto | cuda | mps | cpu")
    ap.add_argument("--format", default="flac")
    args = ap.parse_args(argv)

    device = resolve_device(args.device)
    print(f"model={args.model} device={device}")
    service = SeparationService(model=args.model, device=args.device)

    torch = None
    if device == "cuda":
        import torch  # noqa: PLC0415

    print(f"\n{'song':30} {'audio(s)':>9} {'wall(s)':>8} {'RTF':>6} {'VRAM(MB)':>9}")
    for audio in args.audio:
        name = Path(audio).stem
        dur = _audio_duration(audio)
        if torch is not None:
            torch.cuda.reset_peak_memory_stats()
        t0 = time.perf_counter()
        written = service.separate_to_files(audio, str(Path(args.out_dir) / name), fmt=args.format)
        wall = time.perf_counter() - t0
        vram = ""
        if torch is not None:
            vram = f"{torch.cuda.max_memory_allocated() / 1e6:.0f}"
        rtf = wall / dur if dur > 0 else float("nan")
        print(f"{name[:30]:30} {dur:9.1f} {wall:8.1f} {rtf:6.2f} {vram:>9}")
        print(f"   stems: {', '.join(sorted(written))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

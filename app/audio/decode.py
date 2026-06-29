"""Decode audio to mono float32 PCM via ffmpeg."""

from __future__ import annotations

import shutil
import subprocess

import numpy as np


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def decode_to_mono(path: str, sample_rate: int) -> np.ndarray:
    """Decode any ffmpeg-supported file to a mono float32 array at sample_rate."""
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg not found on PATH; cannot decode audio")
    cmd = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-i", path,
        "-f", "f32le", "-acodec", "pcm_f32le",
        "-ac", "1", "-ar", str(sample_rate),
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(f"ffmpeg failed to decode {path}: {detail}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()

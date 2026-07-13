"""Decode audio to mono float32 PCM via ffmpeg."""

from __future__ import annotations

import math
import shutil
import subprocess

import numpy as np


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def probe_duration(path: str) -> float | None:
    """Container duration in seconds, or None when it can't be determined.

    Reads the header only — no decode — so it is cheap enough to run inside a request.
    Returns None (never 0) when ffprobe is missing or the file isn't recognisable audio,
    so callers must treat "unknown" as "can't tell", not as "zero seconds".
    """
    if shutil.which("ffprobe") is None:
        return None
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        capture_output=True,
    )
    if proc.returncode != 0:
        return None
    try:
        seconds = float(proc.stdout.decode("utf-8", "replace").strip())
    except ValueError:
        return None
    return seconds if math.isfinite(seconds) and seconds > 0 else None


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

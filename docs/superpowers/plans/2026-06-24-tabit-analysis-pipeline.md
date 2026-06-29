# Tabit Analysis Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode an uploaded recording, detect its BPM, key, and chord segments, persist an immutable `Analysis`, and seed an editable `ChordChart` — running in the background so upload stays responsive.

**Architecture:** A pure-Python analysis package (`app/audio/`) composes ffmpeg decoding, librosa beat/chroma features, Krumhansl–Schmuckler key estimation, template-based chord recognition, and segment merging into an `AnalysisResult`. A thin job layer (`app/jobs.py`) runs the analyzer on a worker thread, writes the `Analysis` row, and seeds the chart. The recognizer and the analyzer each sit behind a `Protocol` so a stronger engine (madmom) can replace them later without touching the pipeline or persistence.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, librosa, numpy, ffmpeg (system binary), `concurrent.futures.ThreadPoolExecutor`, pytest.

## Global Constraints

- **Python:** `>=3.12` (matches `pyproject.toml`).
- **No new infrastructure:** background work is an in-process `ThreadPoolExecutor` — no Celery/Redis/broker.
- **v1 chord vocabulary:** major and minor triads plus `dom7`, `maj7`, `min7` only — the exact members of `app.music_theory.Quality`.
- **Music theory stays pure:** `app/music_theory.py` keeps zero I/O and zero third-party deps. New analysis code lives in `app/audio/` and may import numpy/librosa.
- **Per-user scoping preserved:** every new endpoint resolves the recording through `app.deps.get_owned_recording` (404 for non-owners).
- **Status vocabulary:** `Analysis.status` ∈ {`pending`, `running`, `done`, `failed`}. The frontend polls this.
- **Engine version string:** `template-v1` (single source of truth: `app.audio.analyzer.ENGINE_VERSION`).
- **No git / no commits:** this project runs without version control. Each task ends by running the test suite, not by committing. Do **not** run `git` commands.

---

## File Structure

**Create:**
- `app/audio/__init__.py` — package marker.
- `app/audio/recognizer.py` — chord-template recognizer behind a `ChordRecognizer` Protocol.
- `app/audio/key_estimation.py` — Krumhansl–Schmuckler key estimation from a mean chroma vector.
- `app/audio/segments.py` — `DetectedSegment` dataclass, `merge_segments`, `beat_boundaries`.
- `app/audio/decode.py` — ffmpeg decoding to mono float32 PCM + `ffmpeg_available`.
- `app/audio/analyzer.py` — `AnalysisResult`, `Analyzer` Protocol, `LibrosaAnalyzer`, `ENGINE_VERSION`.
- `app/jobs.py` — `analyze_recording` (orchestration + chart seeding), `JobDispatcher`, `get_job_dispatcher`.
- `tests/test_recognizer.py`, `tests/test_key_estimation.py`, `tests/test_segments.py`,
  `tests/test_decode.py`, `tests/test_analyzer.py`, `tests/test_jobs.py`.

**Modify:**
- `pyproject.toml` — add `numpy`, `librosa` (runtime) and `soundfile` (dev/test fixtures).
- `app/config.py` — add `analysis_sample_rate`, `analysis_max_workers`.
- `app/music_theory.py` — add `tonic_for_pitch_class`.
- `app/schemas.py` — add `AnalysisOut`; add `analysis` field to `RecordingOut`.
- `app/routers/recordings.py` — enqueue on upload; add `GET .../analysis` and `POST .../analyze`.
- `app/main.py` — log ffmpeg availability at startup; shut down the dispatcher.
- `tests/conftest.py` — default no-op dispatcher in `client`; add `fake_dispatcher` fixture.
- `README.md` — ffmpeg/librosa install + new endpoints.

---

### Task 1: Music-theory tonic spelling + analysis config

Adds the one pure helper the seeding step needs (pitch class → conventional tonic name) and the two config knobs the pipeline reads. No audio deps yet.

**Files:**
- Modify: `app/music_theory.py` (append `tonic_for_pitch_class`)
- Modify: `app/config.py:8-12` (add two fields)
- Test: `tests/test_music_theory.py` (append cases)

**Interfaces:**
- Consumes: existing `_PREFERRED_MAJOR_TONIC`, `_PREFERRED_MINOR_TONIC` in `app/music_theory.py`.
- Produces: `tonic_for_pitch_class(pc: int, mode: str) -> str`; `Settings.analysis_sample_rate: int`, `Settings.analysis_max_workers: int`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_music_theory.py`:

```python
from app.music_theory import tonic_for_pitch_class


def test_tonic_for_pitch_class_major_uses_conventional_flats():
    assert tonic_for_pitch_class(10, "major") == "Bb"
    assert tonic_for_pitch_class(6, "major") == "Gb"


def test_tonic_for_pitch_class_minor_uses_conventional_sharps():
    assert tonic_for_pitch_class(6, "minor") == "F#"
    assert tonic_for_pitch_class(8, "minor") == "G#"


def test_tonic_for_pitch_class_wraps_octave():
    assert tonic_for_pitch_class(12, "major") == "C"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_music_theory.py -k tonic_for_pitch_class -v`
Expected: FAIL — `ImportError: cannot import name 'tonic_for_pitch_class'`.

- [ ] **Step 3: Add the helper**

Append to `app/music_theory.py`:

```python
def tonic_for_pitch_class(pc: int, mode: str) -> str:
    """Conventional tonic spelling for a pitch class in the given mode."""
    table = _PREFERRED_MAJOR_TONIC if mode == "major" else _PREFERRED_MINOR_TONIC
    return table[pc % 12]
```

- [ ] **Step 4: Add config fields**

In `app/config.py`, add these two fields to the `Settings` class (after `cookie_secure`):

```python
    analysis_sample_rate: int = 22050  # Hz; resample target for analysis
    analysis_max_workers: int = 1  # background analysis threads
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_music_theory.py -v`
Expected: PASS (all existing + 3 new).

- [ ] **Step 6: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass (no regressions). *(No commit — git disabled for this project.)*

---

### Task 2: Chord template recognizer

Pure numpy chroma→chord matching behind a `Protocol`. This is the swappable recognizer seam from the spec.

**Files:**
- Modify: `pyproject.toml:6-14` (add `numpy`)
- Create: `app/audio/__init__.py`
- Create: `app/audio/recognizer.py`
- Test: `tests/test_recognizer.py`

**Interfaces:**
- Consumes: `app.music_theory.Quality`.
- Produces:
  - `ChordRecognizer` Protocol with `recognize(self, chroma: np.ndarray) -> list[tuple[int, Quality]]` (chroma is `12 x N`; returns one `(root_pc, quality)` per column).
  - `TemplateChordRecognizer()` implementing it.

- [ ] **Step 1: Add numpy dependency**

In `pyproject.toml`, add to the `dependencies` list:

```toml
    "numpy>=1.26",
```

Then install: `.venv/bin/pip install -e .`

- [ ] **Step 2: Create the package marker**

Create `app/audio/__init__.py` (empty file).

- [ ] **Step 3: Write the failing test**

Create `tests/test_recognizer.py`:

```python
import numpy as np
import pytest

from app.audio.recognizer import TemplateChordRecognizer
from app.music_theory import Quality


def _chroma(*pitch_classes: int) -> np.ndarray:
    col = np.zeros((12, 1))
    for pc in pitch_classes:
        col[pc, 0] = 1.0
    return col


def test_detects_major_triad():
    assert TemplateChordRecognizer().recognize(_chroma(0, 4, 7)) == [(0, Quality.MAJ)]


def test_detects_minor_triad():
    assert TemplateChordRecognizer().recognize(_chroma(9, 0, 4)) == [(9, Quality.MIN)]


def test_detects_dominant_seventh():
    assert TemplateChordRecognizer().recognize(_chroma(7, 11, 2, 5)) == [(7, Quality.DOM7)]


def test_detects_major_seventh():
    assert TemplateChordRecognizer().recognize(_chroma(0, 4, 7, 11)) == [(0, Quality.MAJ7)]


def test_detects_minor_seventh():
    assert TemplateChordRecognizer().recognize(_chroma(2, 5, 9, 0)) == [(2, Quality.MIN7)]


def test_handles_multiple_columns():
    chroma = np.hstack([_chroma(0, 4, 7), _chroma(7, 11, 2)])
    assert TemplateChordRecognizer().recognize(chroma) == [(0, Quality.MAJ), (7, Quality.MAJ)]


def test_silent_column_falls_back_to_previous():
    chroma = np.hstack([_chroma(0, 4, 7), np.zeros((12, 1))])
    assert TemplateChordRecognizer().recognize(chroma) == [(0, Quality.MAJ), (0, Quality.MAJ)]


def test_rejects_non_12_row_input():
    with pytest.raises(ValueError):
        TemplateChordRecognizer().recognize(np.zeros((11, 3)))
```

- [ ] **Step 4: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_recognizer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.audio.recognizer'`.

- [ ] **Step 5: Implement the recognizer**

Create `app/audio/recognizer.py`:

```python
"""Chord recognition from chroma vectors. v1: cosine template matching (no ML)."""

from __future__ import annotations

from typing import Protocol

import numpy as np

from app.music_theory import Quality

# Semitone offsets from the root for each supported chord quality.
_TEMPLATE_OFFSETS: dict[Quality, tuple[int, ...]] = {
    Quality.MAJ: (0, 4, 7),
    Quality.MIN: (0, 3, 7),
    Quality.DOM7: (0, 4, 7, 10),
    Quality.MAJ7: (0, 4, 7, 11),
    Quality.MIN7: (0, 3, 7, 10),
}


def _build_templates() -> tuple[np.ndarray, list[tuple[int, Quality]]]:
    """Return unit-norm templates (rows x 12) and the (root_pc, quality) label per row."""
    rows: list[np.ndarray] = []
    labels: list[tuple[int, Quality]] = []
    for quality, offsets in _TEMPLATE_OFFSETS.items():
        for root in range(12):
            vec = np.zeros(12, dtype=float)
            for offset in offsets:
                vec[(root + offset) % 12] = 1.0
            rows.append(vec / np.linalg.norm(vec))
            labels.append((root, quality))
    return np.vstack(rows), labels


class ChordRecognizer(Protocol):
    def recognize(self, chroma: np.ndarray) -> list[tuple[int, Quality]]:
        """Label each chroma column (shape 12 x N) with a (root_pc, quality)."""
        ...


class TemplateChordRecognizer:
    """Pick, per chroma column, the chord template with the highest cosine similarity."""

    def __init__(self) -> None:
        self._templates, self._labels = _build_templates()

    def recognize(self, chroma: np.ndarray) -> list[tuple[int, Quality]]:
        if chroma.shape[0] != 12:
            raise ValueError("chroma must have 12 rows (one per pitch class)")
        results: list[tuple[int, Quality]] = []
        for column in chroma.T:
            norm = np.linalg.norm(column)
            if norm == 0:
                # Silent frame: hold the previous chord, or default to C major.
                results.append(results[-1] if results else (0, Quality.MAJ))
                continue
            scores = self._templates @ (column / norm)
            results.append(self._labels[int(np.argmax(scores))])
        return results
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_recognizer.py -v`
Expected: PASS (8 tests).

- [ ] **Step 7: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass.

---

### Task 3: Key estimation

Krumhansl–Schmuckler correlation of a mean chroma vector against rotated major/minor key profiles.

**Files:**
- Create: `app/audio/key_estimation.py`
- Test: `tests/test_key_estimation.py`

**Interfaces:**
- Produces: `estimate_key(chroma_mean: np.ndarray) -> tuple[int, str]` — `(tonic_pitch_class, mode)`, `mode` ∈ {`"major"`, `"minor"`}; input is a length-12 vector. Also module constants `_MAJOR_PROFILE`, `_MINOR_PROFILE` (numpy arrays).

- [ ] **Step 1: Write the failing test**

Create `tests/test_key_estimation.py`:

```python
import numpy as np
import pytest

from app.audio.key_estimation import _MAJOR_PROFILE, _MINOR_PROFILE, estimate_key


def test_detects_c_major():
    assert estimate_key(_MAJOR_PROFILE.copy()) == (0, "major")


def test_detects_g_major():
    assert estimate_key(np.roll(_MAJOR_PROFILE, 7)) == (7, "major")


def test_detects_a_minor():
    assert estimate_key(np.roll(_MINOR_PROFILE, 9)) == (9, "minor")


def test_constant_chroma_defaults_to_c_major():
    assert estimate_key(np.ones(12)) == (0, "major")


def test_rejects_wrong_length():
    with pytest.raises(ValueError):
        estimate_key(np.zeros(11))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_key_estimation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.audio.key_estimation'`.

- [ ] **Step 3: Implement key estimation**

Create `app/audio/key_estimation.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_key_estimation.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass.

---

### Task 4: Segment merging + beat boundaries

Two pure helpers: collapse consecutive identical chord labels into timed segments, and turn beat times into exactly `n+1` ascending edges. Both isolate the only count-sensitive bit of the pipeline so it's testable without audio.

**Files:**
- Create: `app/audio/segments.py`
- Test: `tests/test_segments.py`

**Interfaces:**
- Consumes: `app.music_theory.Quality`.
- Produces:
  - `DetectedSegment(start_time: float, end_time: float, root_pc: int, quality: Quality)` (frozen dataclass).
  - `merge_segments(labels: list[tuple[int, Quality]], boundaries: list[float]) -> list[DetectedSegment]` — `labels[i]` covers `[boundaries[i], boundaries[i+1])`; requires `len(boundaries) == len(labels) + 1`.
  - `beat_boundaries(beat_times: np.ndarray, duration: float, n_segments: int) -> list[float]` — returns `n_segments + 1` ascending edges bracketed by `0.0` and `duration`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_segments.py`:

```python
import numpy as np
import pytest

from app.audio.segments import DetectedSegment, beat_boundaries, merge_segments
from app.music_theory import Quality


def test_merges_consecutive_identical_labels():
    labels = [(0, Quality.MAJ), (0, Quality.MAJ), (7, Quality.MAJ)]
    assert merge_segments(labels, [0.0, 1.0, 2.0, 3.0]) == [
        DetectedSegment(0.0, 2.0, 0, Quality.MAJ),
        DetectedSegment(2.0, 3.0, 7, Quality.MAJ),
    ]


def test_quality_change_breaks_a_segment():
    labels = [(0, Quality.MAJ), (0, Quality.MAJ7)]
    assert len(merge_segments(labels, [0.0, 1.0, 2.0])) == 2


def test_empty_labels_yield_no_segments():
    assert merge_segments([], [0.0]) == []


def test_boundary_count_mismatch_raises():
    with pytest.raises(ValueError):
        merge_segments([(0, Quality.MAJ)], [0.0, 1.0, 2.0])


def test_beat_boundaries_returns_exact_count():
    edges = beat_boundaries(np.array([1.0, 2.0, 3.0]), duration=4.0, n_segments=2)
    assert len(edges) == 3
    assert edges[0] == 0.0
    assert edges[-1] == 4.0
    assert edges == sorted(edges)


def test_beat_boundaries_fills_when_too_few_beats():
    edges = beat_boundaries(np.array([]), duration=4.0, n_segments=4)
    assert len(edges) == 5
    assert edges == sorted(edges)
    assert edges[0] == 0.0 and edges[-1] == 4.0


def test_beat_boundaries_single_segment():
    assert beat_boundaries(np.array([1.0, 2.0]), 3.0, 1) == [0.0, 3.0]


def test_beat_boundaries_rejects_zero_segments():
    with pytest.raises(ValueError):
        beat_boundaries(np.array([1.0]), 3.0, 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_segments.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.audio.segments'`.

- [ ] **Step 3: Implement segments**

Create `app/audio/segments.py`:

```python
"""Merge per-frame chord labels into contiguous timed segments."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.music_theory import Quality


@dataclass(frozen=True)
class DetectedSegment:
    start_time: float
    end_time: float
    root_pc: int
    quality: Quality


def merge_segments(
    labels: list[tuple[int, Quality]], boundaries: list[float]
) -> list[DetectedSegment]:
    """Collapse runs of identical labels. labels[i] covers [boundaries[i], boundaries[i+1])."""
    if len(boundaries) != len(labels) + 1:
        raise ValueError("boundaries must have exactly len(labels) + 1 entries")
    segments: list[DetectedSegment] = []
    for i, (root_pc, quality) in enumerate(labels):
        start, end = boundaries[i], boundaries[i + 1]
        previous = segments[-1] if segments else None
        if previous is not None and previous.root_pc == root_pc and previous.quality == quality:
            segments[-1] = DetectedSegment(previous.start_time, end, root_pc, quality)
        else:
            segments.append(DetectedSegment(start, end, root_pc, quality))
    return segments


def beat_boundaries(beat_times: np.ndarray, duration: float, n_segments: int) -> list[float]:
    """Return n_segments + 1 ascending time edges bracketed by 0.0 and duration."""
    if n_segments < 1:
        raise ValueError("n_segments must be >= 1")
    interior_needed = n_segments - 1
    interior = sorted(float(t) for t in beat_times if 0.0 < t < float(duration))
    if interior_needed == 0:
        interior = []
    elif len(interior) > interior_needed:
        keep = np.linspace(0, len(interior) - 1, interior_needed).round().astype(int)
        interior = [interior[i] for i in keep]
    elif len(interior) < interior_needed:
        interior = list(np.linspace(0.0, float(duration), n_segments + 1)[1:-1])
    return [0.0] + interior + [float(duration)]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_segments.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass.

---

### Task 5: Audio decoding via ffmpeg

Decode any ffmpeg-supported container (`.m4a`, `.mp4`, `.mp3`, `.wav`) to a mono float32 numpy array. Adds the librosa/soundfile dependencies the later tasks need.

**Files:**
- Modify: `pyproject.toml` (add `librosa` runtime, `soundfile` dev)
- Create: `app/audio/decode.py`
- Test: `tests/test_decode.py`

**Interfaces:**
- Produces:
  - `ffmpeg_available() -> bool`.
  - `decode_to_mono(path: str, sample_rate: int) -> np.ndarray` — float32 mono samples; raises `RuntimeError` if ffmpeg is missing or decoding fails.

- [ ] **Step 1: Add dependencies**

In `pyproject.toml`, add to `dependencies`:

```toml
    "librosa>=0.10",
```

And to the `dev` optional-dependencies list:

```toml
    "soundfile>=0.12",
```

Install: `.venv/bin/pip install -e ".[dev]"`

Verify ffmpeg is on PATH (system binary, not pip): `ffmpeg -version`. If absent, install it (`brew install ffmpeg` on macOS). The integration tests below skip when it is missing, but the app needs it at runtime.

- [ ] **Step 2: Write the failing test**

Create `tests/test_decode.py`:

```python
import numpy as np
import pytest

from app.audio.decode import decode_to_mono, ffmpeg_available

pytestmark = pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not installed")


def test_decodes_wav_to_mono_float32(tmp_path):
    sf = pytest.importorskip("soundfile")
    sr = 22050
    t = np.linspace(0.0, 1.0, sr, endpoint=False)
    tone = 0.5 * np.sin(2 * np.pi * 440 * t)
    path = tmp_path / "tone.wav"
    sf.write(str(path), tone, sr)

    out = decode_to_mono(str(path), sr)

    assert out.dtype == np.float32
    assert abs(len(out) - sr) < sr * 0.1  # ~1 second of samples
    assert np.isfinite(out).all()


def test_raises_on_undecodable_input(tmp_path):
    bad = tmp_path / "bad.m4a"
    bad.write_bytes(b"not actually audio")
    with pytest.raises(RuntimeError):
        decode_to_mono(str(bad), 22050)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_decode.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.audio.decode'` (or skipped if ffmpeg missing — install it first).

- [ ] **Step 4: Implement decoding**

Create `app/audio/decode.py`:

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_decode.py -v`
Expected: PASS (2 tests), or SKIPPED if ffmpeg is not installed.

- [ ] **Step 6: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass (decode tests skipped only if ffmpeg absent).

---

### Task 6: Analyzer orchestration

Compose decode + librosa beat/chroma + key estimation + recognizer + boundary/merge into `LibrosaAnalyzer.analyze`, behind an `Analyzer` Protocol so jobs can be tested with a stub.

**Files:**
- Create: `app/audio/analyzer.py`
- Test: `tests/test_analyzer.py`

**Interfaces:**
- Consumes: `decode_to_mono`, `estimate_key`, `TemplateChordRecognizer`/`ChordRecognizer`, `DetectedSegment`, `merge_segments`, `beat_boundaries`.
- Produces:
  - `ENGINE_VERSION = "template-v1"`.
  - `AnalysisResult(bpm: float, key_tonic_pc: int, key_mode: str, segments: list[DetectedSegment], engine_version: str = ENGINE_VERSION)` (frozen dataclass).
  - `Analyzer` Protocol with `analyze(self, audio_path: str) -> AnalysisResult`.
  - `LibrosaAnalyzer(sample_rate: int = 22050, recognizer: ChordRecognizer | None = None)` implementing it.

- [ ] **Step 1: Write the failing test**

Create `tests/test_analyzer.py` (an integration sanity check on synthesized audio; tolerant assertions because v1 detection is approximate):

```python
import numpy as np
import pytest

from app.audio.decode import ffmpeg_available

pytest.importorskip("librosa")
pytestmark = pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not installed")

from app.audio.analyzer import AnalysisResult, LibrosaAnalyzer  # noqa: E402


def _write_chord_song(path, chord_pitch_classes, sr=22050, seconds_each=2.0):
    sf = pytest.importorskip("soundfile")
    base_hz = 261.63  # C4
    blocks = []
    for pcs in chord_pitch_classes:
        t = np.linspace(0.0, seconds_each, int(sr * seconds_each), endpoint=False)
        chord = np.zeros_like(t)
        for pc in pcs:
            freq = base_hz * (2 ** (pc / 12))
            for harmonic in (1, 2, 3):
                chord += np.sin(2 * np.pi * freq * harmonic * t) / harmonic
        blocks.append(chord)
    signal = np.concatenate(blocks)
    signal = 0.3 * signal / np.max(np.abs(signal))
    sf.write(str(path), signal, sr)


def test_analyzes_a_two_chord_song(tmp_path):
    path = tmp_path / "song.wav"
    _write_chord_song(path, [(0, 4, 7), (7, 11, 2)])  # C major, then G major

    result = LibrosaAnalyzer().analyze(str(path))

    assert isinstance(result, AnalysisResult)
    assert result.bpm > 0
    assert result.key_mode in ("major", "minor")
    assert result.engine_version == "template-v1"
    roots = {segment.root_pc for segment in result.segments}
    assert 0 in roots  # C detected somewhere
    assert 7 in roots  # G detected somewhere
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_analyzer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.audio.analyzer'` (or SKIPPED without ffmpeg).

- [ ] **Step 3: Implement the analyzer**

Create `app/audio/analyzer.py`:

```python
"""Full audio-analysis pipeline: decode -> beat/chroma -> key -> chords -> segments."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import librosa
import numpy as np

from app.audio.decode import decode_to_mono
from app.audio.key_estimation import estimate_key
from app.audio.recognizer import ChordRecognizer, TemplateChordRecognizer
from app.audio.segments import DetectedSegment, beat_boundaries, merge_segments

ENGINE_VERSION = "template-v1"


@dataclass(frozen=True)
class AnalysisResult:
    bpm: float
    key_tonic_pc: int
    key_mode: str
    segments: list[DetectedSegment] = field(default_factory=list)
    engine_version: str = ENGINE_VERSION


class Analyzer(Protocol):
    def analyze(self, audio_path: str) -> AnalysisResult: ...


class LibrosaAnalyzer:
    """v1 analyzer: librosa features + template chord recognition."""

    def __init__(
        self, sample_rate: int = 22050, recognizer: ChordRecognizer | None = None
    ) -> None:
        self._sr = sample_rate
        self._recognizer = recognizer or TemplateChordRecognizer()

    def analyze(self, audio_path: str) -> AnalysisResult:
        y = decode_to_mono(audio_path, self._sr)
        if y.size == 0:
            raise RuntimeError("decoded audio is empty")
        duration = float(librosa.get_duration(y=y, sr=self._sr))

        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=self._sr)
        bpm = float(np.atleast_1d(tempo)[0])

        chroma = librosa.feature.chroma_cqt(y=y, sr=self._sr)
        tonic_pc, mode = estimate_key(chroma.mean(axis=1))

        if beat_frames.size >= 2:
            synced = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
            beat_times = librosa.frames_to_time(beat_frames, sr=self._sr)
        else:
            synced = chroma.mean(axis=1, keepdims=True)
            beat_times = np.array([])

        labels = self._recognizer.recognize(synced)
        boundaries = beat_boundaries(beat_times, duration, len(labels))
        segments = merge_segments(labels, boundaries)
        return AnalysisResult(bpm, tonic_pc, mode, segments)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_analyzer.py -v`
Expected: PASS (1 test), or SKIPPED without ffmpeg.

If the root assertions fail intermittently on your machine, the synthesis is too quiet or the CQT resolution too coarse — do not weaken the pipeline; instead confirm `chroma_cqt` peaks at the expected pitch classes for the fixture and adjust the fixture amplitude/harmonics, not the analyzer. Report as DONE_WITH_CONCERNS if it remains flaky.

- [ ] **Step 5: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass.

---

### Task 7: Background job + chart seeding

Run the analyzer for a recording, persist the immutable `Analysis`, and seed/replace the editable `ChordChart`. `analyze_recording` is a plain function (no threads) tested directly with a stub analyzer; `JobDispatcher` wraps it in a thread pool for production.

**Files:**
- Create: `app/jobs.py`
- Test: `tests/test_jobs.py`

**Interfaces:**
- Consumes: `Analyzer`/`AnalysisResult`/`LibrosaAnalyzer`, `DetectedSegment`, `SessionLocal`, models `Analysis`/`ChordChart`/`ChordSegment`/`Recording`, `tonic_for_pitch_class`/`key_prefers_flats`/`pitch_class_to_note`, `get_settings`.
- Produces:
  - `analyze_recording(db: Session, recording_id: str, analyzer: Analyzer) -> None` — sets `Analysis.status` to `running` → `done`/`failed`, writes fields, seeds chart.
  - `JobDispatcher(max_workers: int, analyzer: Analyzer)` with `.dispatch(recording_id: str) -> None` and `.shutdown() -> None`.
  - `get_job_dispatcher() -> JobDispatcher` (lru_cached singleton).

- [ ] **Step 1: Write the failing test**

Create `tests/test_jobs.py`:

```python
from app.audio.analyzer import AnalysisResult
from app.audio.segments import DetectedSegment
from app.jobs import analyze_recording
from app.models import Analysis, ChordChart, Recording, User
from app.music_theory import Quality
from app.security import hash_password


class StubAnalyzer:
    def __init__(self, result=None, exc=None):
        self._result = result
        self._exc = exc

    def analyze(self, audio_path):
        if self._exc is not None:
            raise self._exc
        return self._result


def _seed_pending_recording(db):
    user = User(username="u", password_hash=hash_password("password123"))
    db.add(user)
    db.flush()
    rec = Recording(
        user_id=user.id, original_filename="a.wav", format="wav",
        stored_path="/x/a.wav", duration_seconds=4.0,
    )
    db.add(rec)
    db.flush()
    db.add(Analysis(recording_id=rec.id, status="pending"))
    db.commit()
    return rec


def test_successful_analysis_seeds_chart(db_session):
    rec = _seed_pending_recording(db_session)
    result = AnalysisResult(
        bpm=120.0, key_tonic_pc=0, key_mode="major",
        segments=[
            DetectedSegment(0.0, 2.0, 0, Quality.MAJ),
            DetectedSegment(2.0, 4.0, 7, Quality.MAJ),
        ],
        engine_version="template-v1",
    )

    analyze_recording(db_session, rec.id, StubAnalyzer(result=result))

    analysis = db_session.query(Analysis).filter_by(recording_id=rec.id).one()
    assert analysis.status == "done"
    assert analysis.bpm == 120.0
    assert analysis.detected_key_tonic == "C"
    assert analysis.detected_key_mode == "major"
    assert analysis.engine_version == "template-v1"
    chart = db_session.query(ChordChart).filter_by(recording_id=rec.id).one()
    assert chart.key_tonic == "C"
    assert [(s.chord_root, s.chord_quality) for s in chart.segments] == [
        ("C", "maj"), ("G", "maj"),
    ]


def test_failed_analysis_records_error_and_no_chart(db_session):
    rec = _seed_pending_recording(db_session)

    analyze_recording(db_session, rec.id, StubAnalyzer(exc=RuntimeError("bad audio")))

    analysis = db_session.query(Analysis).filter_by(recording_id=rec.id).one()
    assert analysis.status == "failed"
    assert "bad audio" in analysis.error
    assert db_session.query(ChordChart).filter_by(recording_id=rec.id).count() == 0


def test_reanalysis_replaces_existing_chart(db_session):
    rec = _seed_pending_recording(db_session)
    first = AnalysisResult(120.0, 0, "major", [DetectedSegment(0.0, 4.0, 0, Quality.MAJ)])
    analyze_recording(db_session, rec.id, StubAnalyzer(result=first))

    second = AnalysisResult(90.0, 7, "major", [DetectedSegment(0.0, 4.0, 7, Quality.MAJ)])
    analyze_recording(db_session, rec.id, StubAnalyzer(result=second))

    chart = db_session.query(ChordChart).filter_by(recording_id=rec.id).one()
    assert chart.key_tonic == "G"
    assert [(s.chord_root, s.chord_quality) for s in chart.segments] == [("G", "maj")]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_jobs.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.jobs'`.

- [ ] **Step 3: Implement the job layer**

Create `app/jobs.py`:

```python
"""In-process background analysis jobs and the chart seeding that follows."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audio.analyzer import Analyzer, AnalysisResult, LibrosaAnalyzer
from app.config import get_settings
from app.db import SessionLocal
from app.models import Analysis, ChordChart, ChordSegment, Recording
from app.music_theory import key_prefers_flats, pitch_class_to_note, tonic_for_pitch_class

logger = logging.getLogger(__name__)


def analyze_recording(db: Session, recording_id: str, analyzer: Analyzer) -> None:
    """Run analysis for one recording, persist results, and seed its chart."""
    analysis = db.execute(
        select(Analysis).where(Analysis.recording_id == recording_id)
    ).scalar_one_or_none()
    recording = db.get(Recording, recording_id)
    if analysis is None or recording is None:
        logger.warning("analyze_recording: no analysis/recording for %s", recording_id)
        return

    analysis.status = "running"
    analysis.error = None
    db.commit()

    try:
        result = analyzer.analyze(recording.stored_path)
    except Exception as exc:  # decode/analysis failure -> FAILED with surfaced message
        db.rollback()
        analysis.status = "failed"
        analysis.error = str(exc)[:1000]
        db.commit()
        logger.exception("analysis failed for recording %s", recording_id)
        return

    _write_result(analysis, result)
    _seed_chart(db, recording, result)
    analysis.status = "done"
    db.commit()


def _write_result(analysis: Analysis, result: AnalysisResult) -> None:
    analysis.bpm = result.bpm
    analysis.detected_key_tonic = tonic_for_pitch_class(result.key_tonic_pc, result.key_mode)
    analysis.detected_key_mode = result.key_mode
    analysis.engine_version = result.engine_version


def _seed_chart(db: Session, recording: Recording, result: AnalysisResult) -> None:
    existing = db.execute(
        select(ChordChart).where(ChordChart.recording_id == recording.id)
    ).scalar_one_or_none()
    if existing is not None:
        db.delete(existing)
        db.flush()

    tonic = tonic_for_pitch_class(result.key_tonic_pc, result.key_mode)
    prefer_flats = key_prefers_flats(tonic, result.key_mode)
    chart = ChordChart(recording_id=recording.id, key_tonic=tonic, key_mode=result.key_mode)
    db.add(chart)
    db.flush()
    for segment in result.segments:
        db.add(
            ChordSegment(
                chart_id=chart.id,
                start_time=segment.start_time,
                end_time=segment.end_time,
                chord_root=pitch_class_to_note(segment.root_pc, prefer_flats=prefer_flats),
                chord_quality=segment.quality.value,
            )
        )


class JobDispatcher:
    """Runs analysis on worker threads, each with its own DB session."""

    def __init__(self, max_workers: int, analyzer: Analyzer) -> None:
        self._pool = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="analysis"
        )
        self._analyzer = analyzer

    def dispatch(self, recording_id: str) -> None:
        self._pool.submit(self._run, recording_id)

    def _run(self, recording_id: str) -> None:
        db = SessionLocal()
        try:
            analyze_recording(db, recording_id, self._analyzer)
        finally:
            db.close()

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)


@lru_cache
def get_job_dispatcher() -> JobDispatcher:
    settings = get_settings()
    return JobDispatcher(
        settings.analysis_max_workers, LibrosaAnalyzer(settings.analysis_sample_rate)
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_jobs.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass.

---

### Task 8: Wire analysis into the API

Enqueue analysis on upload, expose analysis status for polling, and add a re-run endpoint. Add the `AnalysisOut` schema and a default no-op dispatcher in tests so the suite never spawns real threads.

**Files:**
- Modify: `app/schemas.py` (add `AnalysisOut`; add `analysis` to `RecordingOut`)
- Modify: `app/routers/recordings.py` (dispatcher on upload; `GET .../analysis`; `POST .../analyze`)
- Modify: `app/main.py` (ffmpeg startup log; dispatcher shutdown)
- Modify: `tests/conftest.py` (default dispatcher override + `fake_dispatcher` fixture)
- Test: `tests/test_recordings.py` (append)

**Interfaces:**
- Consumes: `get_job_dispatcher`, `JobDispatcher` from `app.jobs`; `Analysis` model; `ffmpeg_available`.
- Produces:
  - `AnalysisOut` schema: `status, bpm, detected_key_tonic, detected_key_mode, engine_version, error`.
  - `RecordingOut.analysis: AnalysisOut | None`.
  - Endpoints: `POST /api/recordings` (now enqueues), `GET /api/recordings/{id}/analysis`, `POST /api/recordings/{id}/analyze` (202).

- [ ] **Step 1: Add schemas**

In `app/schemas.py`, add the `AnalysisOut` model (after `RecordingOut`) and add the `analysis` field to `RecordingOut`:

```python
class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    bpm: float | None
    detected_key_tonic: str | None
    detected_key_mode: str | None
    engine_version: str | None
    error: str | None
```

Then modify `RecordingOut` to include analysis (add the field; keep the rest):

```python
class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    original_filename: str
    format: str
    duration_seconds: float | None
    status: str
    analysis: AnalysisOut | None = None
```

> Note: `AnalysisOut` must be defined *before* `RecordingOut` references it, or use a forward reference. Simplest: place `AnalysisOut` above `RecordingOut`.

- [ ] **Step 2: Update conftest with dispatcher overrides**

In `tests/conftest.py`, add a fake dispatcher class and wire a default override into the `client` fixture, plus a `fake_dispatcher` fixture for capturing dispatch calls. Replace the `client` fixture and add the new pieces:

```python
from app.jobs import get_job_dispatcher  # add to imports at top


class _FakeDispatcher:
    def __init__(self):
        self.dispatched: list[str] = []

    def dispatch(self, recording_id: str) -> None:
        self.dispatched.append(recording_id)

    def shutdown(self) -> None:
        pass


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_job_dispatcher] = lambda: _FakeDispatcher()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def fake_dispatcher(client):
    fake = _FakeDispatcher()
    app.dependency_overrides[get_job_dispatcher] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_job_dispatcher, None)
```

- [ ] **Step 3: Write the failing tests**

Append to `tests/test_recordings.py`:

```python
def test_upload_creates_pending_analysis_and_dispatches(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]

    assert fake_dispatcher.dispatched == [rec_id]
    analysis = client.get(f"/api/recordings/{rec_id}/analysis")
    assert analysis.status_code == 200
    assert analysis.json()["status"] == "pending"


def test_recording_payload_includes_analysis(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]

    body = client.get(f"/api/recordings/{rec_id}").json()
    assert body["analysis"]["status"] == "pending"


def test_reanalyze_resets_status_and_dispatches(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]
    fake_dispatcher.dispatched.clear()

    resp = client.post(f"/api/recordings/{rec_id}/analyze")
    assert resp.status_code == 202
    assert resp.json()["status"] == "pending"
    assert fake_dispatcher.dispatched == [rec_id]


def test_analysis_of_other_users_recording_is_404(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    rec_id = _upload(client, "a.m4a").json()["id"]
    client.post("/api/auth/logout")
    _register(client, "bob")
    assert client.get(f"/api/recordings/{rec_id}/analysis").status_code == 404
    assert client.post(f"/api/recordings/{rec_id}/analyze").status_code == 404
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_recordings.py -v`
Expected: FAIL — new endpoints 404/405 and `fake_dispatcher.dispatched` empty (upload doesn't dispatch yet).

- [ ] **Step 5: Wire the recordings router**

In `app/routers/recordings.py`: add imports, dispatch on upload, and add the two endpoints. Updated file:

```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db import get_db
from app.deps import get_current_user, get_owned_recording
from app.jobs import JobDispatcher, get_job_dispatcher
from app.models import Analysis, Recording, User
from app.schemas import AnalysisOut, RecordingOut
from app.storage import delete_audio, save_audio

router = APIRouter(prefix="/api/recordings", tags=["recordings"])


@router.get("", response_model=list[RecordingOut])
def list_recordings(
    db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Recording]:
    return list(
        db.execute(
            select(Recording).where(Recording.user_id == user.id).order_by(Recording.created_at.desc())
        ).scalars()
    )


@router.post("", response_model=RecordingOut, status_code=status.HTTP_201_CREATED)
def upload_recording(
    file: UploadFile = File(...),
    duration_seconds: float | None = Form(default=None),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
    dispatcher: JobDispatcher = Depends(get_job_dispatcher),
) -> Recording:
    filename = file.filename or "recording"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    rec = Recording(
        user_id=user.id,
        original_filename=filename,
        format=ext,
        stored_path="",
        duration_seconds=duration_seconds,
    )
    db.add(rec)
    db.flush()  # assign rec.id
    rec.stored_path = save_audio(user.id, rec.id, ext, file.file.read())
    db.add(Analysis(recording_id=rec.id, status="pending"))
    try:
        db.commit()
    except Exception:
        # Roll back the row and remove the just-written file so neither is orphaned.
        db.rollback()
        delete_audio(rec.stored_path)
        raise
    db.refresh(rec)
    dispatcher.dispatch(rec.id)
    return rec


@router.get("/{recording_id}", response_model=RecordingOut)
def get_recording(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> Recording:
    return get_owned_recording(db, user, recording_id)


@router.get("/{recording_id}/analysis", response_model=AnalysisOut)
def get_analysis(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> Analysis:
    rec = get_owned_recording(db, user, recording_id)
    if rec.analysis is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    return rec.analysis


@router.post(
    "/{recording_id}/analyze",
    response_model=AnalysisOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def reanalyze_recording(
    recording_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
    dispatcher: JobDispatcher = Depends(get_job_dispatcher),
) -> Analysis:
    rec = get_owned_recording(db, user, recording_id)
    if rec.analysis is not None:
        db.delete(rec.analysis)  # immutable Analysis: re-run creates a fresh one
        db.flush()
    analysis = Analysis(recording_id=rec.id, status="pending")
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    dispatcher.dispatch(rec.id)
    return analysis


@router.delete("/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recording(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    rec = get_owned_recording(db, user, recording_id)
    delete_audio(rec.stored_path)
    db.delete(rec)
    db.commit()
```

- [ ] **Step 6: Update main.py for ffmpeg check + dispatcher shutdown**

Replace `app/main.py` with:

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.audio.decode import ffmpeg_available
from app.db import Base, engine
from app.jobs import get_job_dispatcher
from app.routers import auth, charts, recordings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if not ffmpeg_available():
        logger.error(
            "ffmpeg not found on PATH — audio analysis will fail until ffmpeg is installed"
        )
    try:
        yield
    finally:
        get_job_dispatcher().shutdown()


app = FastAPI(title="Tabit", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(recordings.router)
app.include_router(charts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Run the targeted tests**

Run: `.venv/bin/pytest tests/test_recordings.py -v`
Expected: PASS (existing 5 + new 4).

- [ ] **Step 8: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass. *(No commit — git disabled for this project.)*

---

### Task 9: Documentation

Document the new system dependency (ffmpeg), the analysis flow, the new endpoints, and the config knobs.

**Files:**
- Modify: `README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update README**

Add to `README.md` (under the existing setup/config sections):

- **System dependency:** `ffmpeg` must be installed and on `PATH` (`brew install ffmpeg` on macOS; `apt install ffmpeg` on Debian/Ubuntu). Without it, uploads succeed but analysis jobs fail with a surfaced error, and a clear error is logged at startup.
- **Analysis flow:** Upload enqueues an in-process background job that decodes the audio, detects BPM and key, recognizes chord segments (`template-v1`), writes an immutable `Analysis`, and seeds an editable `ChordChart`. Poll `GET /api/recordings/{id}/analysis` for `pending`/`running`/`done`/`failed`.
- **New endpoints:**
  - `GET /api/recordings/{id}/analysis` — analysis status + results.
  - `POST /api/recordings/{id}/analyze` — re-run analysis (202; creates a fresh `Analysis` and re-seeds the chart, overwriting manual edits).
- **New config (env, `TABIT_` prefix):** `TABIT_ANALYSIS_SAMPLE_RATE` (default `22050`), `TABIT_ANALYSIS_MAX_WORKERS` (default `1`).

- [ ] **Step 2: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: all pass.

---

## Self-Review

**1. Spec coverage** (from `docs/superpowers/specs/2026-06-17-tabit-design.md`):

| Spec requirement | Task |
|---|---|
| Pipeline: decode → load → BPM → key → beat-sync chroma → chords → merge | 5, 6 |
| Chord recognizer behind an interface (madmom-swappable) | 2 (`ChordRecognizer` Protocol), 6 (`Analyzer` Protocol) |
| v1 vocabulary = triads + 7ths | 2 (`_TEMPLATE_OFFSETS` = the 5 `Quality` members) |
| BPM from librosa beat tracking | 6 |
| Key via Krumhansl–Schmuckler over chroma | 3 |
| In-process async background task + status field | 7 (`JobDispatcher`), 8 (enqueue) |
| Analysis immutable; re-run creates new + re-seeds chart (warns on overwrite) | 7 (`_seed_chart` replace), 8 (`/analyze`); warning is a frontend concern |
| Chart seeded from analysis (key + segments, roman numeral computed on read) | 7 (`_seed_chart`); roman numerals already computed in charts router |
| Missing ffmpeg detected at startup with a clear error | 8 (`main.py` startup log) |
| Corrupt/unsupported audio → FAILED with surfaced message | 7 (`analyze_recording` except branch), validated by `test_failed_analysis...` |
| Per-user scoping on new endpoints (404 for non-owners) | 8 (`get_owned_recording`), validated by `test_analysis_of_other_users...` |
| Analysis tested against a fixture clip with known chords/BPM/key | 6 (`test_analyzer.py`) |

Deferred items remain deferred (madmom swap, correct-key-center op, extended vocabulary) — the Protocols leave room for them.

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every test shows assertions. ✓

**3. Type consistency:** `AnalysisResult` fields (`bpm`, `key_tonic_pc`, `key_mode`, `segments`, `engine_version`) are produced in Task 6 and consumed unchanged in Task 7. `DetectedSegment(start_time, end_time, root_pc, quality)` is defined in Task 4 and used identically in Tasks 6–7. `recognize` returns `list[tuple[int, Quality]]` in Task 2 and is consumed as `(root_pc, quality)` in Tasks 4/6. `analyze_recording(db, recording_id, analyzer)`, `JobDispatcher.dispatch`, and `get_job_dispatcher` signatures match between Tasks 7 and 8. `Quality.value` (e.g. `"maj"`) matches the `SegmentCreate.chord_quality` pattern. ✓

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-24-tabit-analysis-pipeline.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**

"""Tier 2 Chordino engine: parse the Vamp Chordino plugin's output into Tabit chords.

Chordino (the ``nnls-chroma:chordino`` Vamp plugin) does NNLS-chroma note transcription
plus a trained Viterbi decode, emitting chord change-points like ``{'label': 'G7',
'timestamp': 2.04}``. Its richer vocabulary (7ths, 6ths, sus, dim, aug, slash chords) is
reduced here to Tabit's five output qualities, and the change-points become timed
``DetectedSegment``s. The plugin call itself lives in :mod:`app.audio.analyzer`.
"""

from __future__ import annotations

import re

from app.audio.segments import DetectedSegment, drop_short_segments
from app.music_theory import Quality, note_to_pitch_class

# Chordino label = <root><suffix>[/<bass>]; "N"/"X" mean no / unknown chord.
_LABEL = re.compile(r"^([A-G][#b]?)(.*)$")

# Exact suffix -> output quality. Extensions collapse to the nearest of the five.
_SUFFIX_TO_QUALITY: dict[str, Quality] = {
    "": Quality.MAJ, "maj": Quality.MAJ, "M": Quality.MAJ, "6": Quality.MAJ,
    "add9": Quality.MAJ, "sus": Quality.MAJ, "sus2": Quality.MAJ, "sus4": Quality.MAJ,
    "aug": Quality.MAJ, "+": Quality.MAJ,
    "m": Quality.MIN, "min": Quality.MIN, "-": Quality.MIN, "m6": Quality.MIN,
    "min6": Quality.MIN, "dim": Quality.MIN, "dim7": Quality.MIN, "o": Quality.MIN,
    "7": Quality.DOM7, "9": Quality.DOM7, "7sus4": Quality.DOM7,
    "maj7": Quality.MAJ7, "M7": Quality.MAJ7, "maj9": Quality.MAJ7,
    "m7": Quality.MIN7, "min7": Quality.MIN7, "-7": Quality.MIN7, "m9": Quality.MIN7,
    "min9": Quality.MIN7, "m7b5": Quality.MIN7,
}


def _reduce_suffix(suffix: str) -> Quality:
    """Map any chord suffix to one of the five output qualities (heuristic fallback)."""
    if suffix in _SUFFIX_TO_QUALITY:
        return _SUFFIX_TO_QUALITY[suffix]
    low = suffix.lower()
    has_seventh = any(d in low for d in ("7", "9", "11", "13"))
    if "maj" in low:
        return Quality.MAJ7 if has_seventh else Quality.MAJ
    if low[:1] == "m" or low.startswith("min") or low[:1] == "-":
        return Quality.MIN7 if has_seventh else Quality.MIN
    if "dim" in low or low[:1] == "o":
        return Quality.MIN
    if "aug" in low or low[:1] == "+":
        return Quality.MAJ
    return Quality.DOM7 if has_seventh else Quality.MAJ


def parse_chord_label(label: str) -> tuple[int, Quality] | None:
    """Parse a Chordino label to (root_pc, quality); None for no-chord/unparseable."""
    match = _LABEL.match(label)
    if match is None:
        return None
    root_name, rest = match.group(1), match.group(2)
    suffix = rest.split("/", 1)[0]  # drop the slash bass note
    return note_to_pitch_class(root_name), _reduce_suffix(suffix)


def chordino_segments(
    entries: list[dict],
    duration: float,
    min_segment_seconds: float,
) -> list[DetectedSegment]:
    """Turn Chordino change-points into timed segments over [0, duration].

    Each entry's chord runs until the next entry's timestamp (or ``duration`` for the
    last). No-chord ("N") entries are dropped but still bound their neighbours, so leading
    and trailing silence is naturally excluded.
    """
    times = [min(float(e["timestamp"]), duration) for e in entries]
    raw: list[DetectedSegment] = []
    for i, entry in enumerate(entries):
        start = times[i]
        end = times[i + 1] if i + 1 < len(entries) else duration
        end = min(end, duration)
        if end <= start:
            continue
        parsed = parse_chord_label(str(entry["label"]))
        if parsed is None:
            continue
        root_pc, quality = parsed
        prev = raw[-1] if raw else None
        if (
            prev is not None
            and prev.root_pc == root_pc
            and prev.quality == quality
            and abs(prev.end_time - start) < 1e-6
        ):
            raw[-1] = DetectedSegment(prev.start_time, end, root_pc, quality)
        else:
            raw.append(DetectedSegment(start, end, root_pc, quality))
    if not raw:
        return []
    return drop_short_segments(raw, min_segment_seconds)

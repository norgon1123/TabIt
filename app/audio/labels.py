"""MIREX ``.lab`` chord labels — the interchange format for the eval harness.

A ``.lab`` file is one segment per line: ``start_seconds  end_seconds  label`` (tab or
space separated), where ``label`` is a chord symbol like ``C:maj`` / ``A:min7`` / ``G:7``
or ``N`` for no-chord. This module converts Tabit's :class:`DetectedSegment`s to that form
and parses reference files back, so predictions and ground truth meet in one vocabulary
that ``mir_eval.chord`` understands. No heavy deps — pure stdlib + music theory.
"""

from __future__ import annotations

from app.audio.segments import DetectedSegment
from app.music_theory import Quality, pitch_class_to_note

# Tabit's five output qualities -> mir_eval / MIREX chord-quality shorthand.
_QUALITY_TO_MIREVAL: dict[Quality, str] = {
    Quality.MAJ: "maj",
    Quality.MIN: "min",
    Quality.DOM7: "7",
    Quality.MAJ7: "maj7",
    Quality.MIN7: "min7",
}

# No-chord symbol (silence / unpitched). MIREX uses "N".
NO_CHORD = "N"

Interval = tuple[float, float]


def segment_label(root_pc: int, quality: Quality) -> str:
    """Render one segment as a MIREX label, e.g. (0, MAJ) -> "C:maj"."""
    root = pitch_class_to_note(root_pc, prefer_flats=False)
    return f"{root}:{_QUALITY_TO_MIREVAL[quality]}"


def segments_to_lab(
    segments: list[DetectedSegment],
    *,
    span_end: float | None = None,
) -> tuple[list[Interval], list[str]]:
    """Convert detected segments to (intervals, labels), filling gaps with no-chord.

    ``mir_eval`` wants a gapless interval sequence over the evaluated span. Any hole
    between segments (and, if ``span_end`` is given, the tail after the last segment)
    becomes an ``N`` interval so silence is scored as no-chord rather than dropped.
    """
    ordered = sorted(segments, key=lambda s: s.start_time)
    intervals: list[Interval] = []
    labels: list[str] = []
    cursor = 0.0
    for seg in ordered:
        if seg.end_time <= seg.start_time:
            continue
        if seg.start_time > cursor + 1e-9:
            intervals.append((cursor, seg.start_time))
            labels.append(NO_CHORD)
        intervals.append((seg.start_time, seg.end_time))
        labels.append(segment_label(seg.root_pc, seg.quality))
        cursor = seg.end_time
    if span_end is not None and span_end > cursor + 1e-9:
        intervals.append((cursor, span_end))
        labels.append(NO_CHORD)
    return intervals, labels


def format_lab(intervals: list[Interval], labels: list[str]) -> str:
    """Serialize (intervals, labels) to ``.lab`` text (millisecond-precision times)."""
    if len(intervals) != len(labels):
        raise ValueError("intervals and labels must be the same length")
    lines = [
        f"{start:.3f}\t{end:.3f}\t{label}"
        for (start, end), label in zip(intervals, labels)
    ]
    return "\n".join(lines) + ("\n" if lines else "")


def parse_lab(text: str) -> tuple[list[Interval], list[str]]:
    """Parse ``.lab`` text into (intervals, labels). Blank lines are ignored."""
    intervals: list[Interval] = []
    labels: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 3:
            raise ValueError(f"malformed .lab line: {raw!r}")
        start, end = float(parts[0]), float(parts[1])
        label = " ".join(parts[2:])
        intervals.append((start, end))
        labels.append(label)
    return intervals, labels


def write_lab(path: str, intervals: list[Interval], labels: list[str]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(format_lab(intervals, labels))


def read_lab(path: str) -> tuple[list[Interval], list[str]]:
    with open(path, encoding="utf-8") as fh:
        return parse_lab(fh.read())

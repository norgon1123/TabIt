// #6: a lead-sheet wraps to a whole number of chords per line that scales with tempo —
// at least 4 (slow songs), at most 16 (fast songs).
export function chordsPerLine(bpm: number | null | undefined): number {
  if (!bpm || !Number.isFinite(bpm) || bpm <= 0) return 8;
  return Math.max(4, Math.min(16, Math.round(bpm / 15)));
}

// Round 2 #3 + #6: wrap the chart into lines of `perLine` chords (left-justified). Within a
// line each chord is later sized in proportion to its duration, so the chart reads like time.
export function groupIntoLines<T>(items: T[], perLine: number): T[][] {
  const size = Math.max(1, Math.round(perLine));
  const lines: T[][] = [];
  for (let i = 0; i < items.length; i += size) lines.push(items.slice(i, i + size));
  return lines;
}

export interface SegmentUpdate {
  id: string;
  patch: { start_time?: number; end_time?: number };
}

// #2: moving the boundary between two adjacent chords. Patch the shrinking side first so a
// PATCH never transiently overlaps a neighbour (which the API would reject).
export function boundaryUpdates(
  left: { id: string } | undefined,
  right: { id: string } | undefined,
  oldBoundary: number,
  newBoundary: number,
): SegmentUpdate[] {
  if (newBoundary === oldBoundary) return [];
  const updates: SegmentUpdate[] = [];
  if (left) updates.push({ id: left.id, patch: { end_time: newBoundary } });
  if (right) updates.push({ id: right.id, patch: { start_time: newBoundary } });
  if (newBoundary > oldBoundary) updates.reverse(); // growing left edge ⇒ right side shrinks first
  return updates;
}

// how many measures fit on one line of the lead sheet.
export const MEASURES_PER_LINE = 4;

interface BeatSpan { start_beat: number; end_beat: number; }

// Greedily fill each line until adding the next chord would exceed `beatsPerLine`,
// so bar lines stay regular. A chord longer than a line gets its own line.
export function groupIntoLines<T extends BeatSpan>(items: T[], beatsPerLine: number): T[][] {
  const cap = Math.max(1, beatsPerLine);
  const lines: T[][] = [];
  let line: T[] = [];
  let acc = 0;
  for (const item of items) {
    const len = Math.max(0.5, item.end_beat - item.start_beat);
    if (line.length > 0 && acc + len > cap + 1e-6) {
      lines.push(line);
      line = [];
      acc = 0;
    }
    line.push(item);
    acc += len;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export interface SegmentUpdate {
  id: string;
  patch: { start_beat?: number; end_beat?: number };
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
  if (left) updates.push({ id: left.id, patch: { end_beat: newBoundary } });
  if (right) updates.push({ id: right.id, patch: { start_beat: newBoundary } });
  if (newBoundary > oldBoundary) updates.reverse();
  return updates;
}

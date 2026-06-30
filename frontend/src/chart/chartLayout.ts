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

// Round 2 #4: insert (don't swap) — move `fromId` so it lands at `insertIndex` in the current
// left-to-right order, pushing the rest right. `insertIndex` is a gap index in [0, ids.length].
export function reorderIds(ids: string[], fromId: string, insertIndex: number): string[] {
  const from = ids.indexOf(fromId);
  if (from < 0) return ids.slice();
  const without = ids.filter((id) => id !== fromId);
  // Removing `fromId` shifts every later gap one slot to the left.
  const adjusted = insertIndex > from ? insertIndex - 1 : insertIndex;
  const clamped = Math.max(0, Math.min(without.length, adjusted));
  without.splice(clamped, 0, fromId);
  return without;
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

import { snapHalfBeat } from "./beatMath";

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

const MIN_BEATS = 0.5;

// Resize chord[index] to `newLength`, conserving the total by taking beats from
// (or giving them to) the FOLLOWING chords so the run stays contiguous. Growing
// consumes the next chord first, then ripples into later chords down to MIN_BEATS;
// growth is capped at the followers' available slack. Shrinking gives the freed
// beats to the immediate next chord. The last chord (no followers) is clamped at
// `maxTotalBeats`. Returns the full ordered window list.
export function redistributeLength(
  segments: BeatSpan[],
  index: number,
  newLength: number,
  maxTotalBeats: number,
): { start_beat: number; end_beat: number }[] {
  const out = segments.map((s) => ({ start_beat: s.start_beat, end_beat: s.end_beat }));
  if (index < 0 || index >= out.length) return out;

  const edited = out[index];
  const oldLength = edited.end_beat - edited.start_beat;
  const followers = out.slice(index + 1);

  if (followers.length === 0) {
    const requested = Math.max(MIN_BEATS, snapHalfBeat(newLength));
    edited.end_beat = Math.min(snapHalfBeat(edited.start_beat + requested), maxTotalBeats);
    return out;
  }

  const followerLengths = followers.map((s) => s.end_beat - s.start_beat);
  const slack = followerLengths.reduce((acc, len) => acc + (len - MIN_BEATS), 0);

  let delta = Math.max(MIN_BEATS, snapHalfBeat(newLength)) - oldLength;
  if (delta > 0) delta = Math.min(delta, slack); // can't reclaim more than the slack

  edited.end_beat = snapHalfBeat(edited.start_beat + oldLength + delta);

  let cursor = edited.end_beat;
  let toReclaim = delta > 0 ? delta : 0;
  followers.forEach((f, i) => {
    let len = followerLengths[i];
    if (toReclaim > 0) {
      const give = Math.min(toReclaim, len - MIN_BEATS);
      len -= give;
      toReclaim -= give;
    } else if (delta < 0 && i === 0) {
      len += -delta; // the immediate next chord absorbs the freed beats
    }
    f.start_beat = snapHalfBeat(cursor);
    f.end_beat = snapHalfBeat(cursor + len);
    cursor = f.end_beat;
  });

  return out;
}

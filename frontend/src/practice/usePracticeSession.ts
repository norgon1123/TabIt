import { useCallback, useMemo, useState } from "react";
import type { SegmentOut } from "../api/types";

/** The chords a player has named correctly in this sitting.
 *
 * Held in memory and nowhere else, on purpose. A practice run is a sitting, not an artifact:
 * reloading the page starts the song over, and — the constraint that decides it — a guest
 * must leave nothing behind. Persisting progress later means changing this hook and nothing
 * that uses it.
 */
export function usePracticeSession(segments: SegmentOut[]) {
  const [solved, setSolved] = useState<ReadonlySet<string>>(() => new Set());

  const reveal = useCallback((segmentId: string) => {
    setSolved((prev) => new Set(prev).add(segmentId));
  }, []);

  // Every chord the player has not yet named. The chart can change underneath a session (a
  // re-count rewrites every segment's beats), so this is derived from the live segments
  // rather than accumulated — a segment that no longer exists cannot stay masked.
  const masked = useMemo(
    () => new Set(segments.filter((s) => !solved.has(s.id)).map((s) => s.id)),
    [segments, solved],
  );

  return {
    masked: masked as ReadonlySet<string>,
    isSolved: useCallback((segmentId: string) => solved.has(segmentId), [solved]),
    reveal,
    solvedCount: segments.length - masked.size,
    total: segments.length,
  };
}

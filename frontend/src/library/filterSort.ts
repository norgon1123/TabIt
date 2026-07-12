import type { RecordingOut } from "../api/types";

export type SortDir = "newest" | "oldest";

export function filterAndSortRecordings(
  recordings: RecordingOut[],
  query: string,
  sortDir: SortDir,
): RecordingOut[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? recordings.filter((r) => r.original_filename.toLowerCase().includes(needle))
    : recordings;
  // ISO 8601 timestamps compare correctly as strings.
  const sorted = [...filtered].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
  return sortDir === "newest" ? sorted.reverse() : sorted;
}

# Beat-count edit redistributes neighbouring chords

**Date:** 2026-06-30
**Status:** Approved (pending spec review)

## Problem

In the beat-native chart editor, changing a chord's **Beats** field and saving
sends a PATCH that moves only that segment's `end_beat` to `start_beat + newLength`.
Segments are a contiguous run of beat-spans, so:

- **Growing** a chord pushes its `end_beat` past the next segment's `start_beat`.
  The server's overlap guard (`app/routers/charts.py` `_validate_segment_window`,
  the `start < other.end_beat and end > other.start_beat` check) rejects it with
  HTTP 422 *"segment overlaps an existing segment"*. The user sees a raw error and
  the edit is lost.
- **Shrinking** a chord silently leaves a gap between it and the next chord.

There is also a hard rule (AGENTS.md): a chart's total length must **never exceed**
the recording's duration / beat grid (`total_beats(grid, duration)`).

## Goal

Editing a chord's beat count should **redistribute** beats with the following
chords so the run stays contiguous and the total is conserved, and the timeline
should reflect the new sizes **immediately** while the save is debounced.

## Decisions (from brainstorming)

1. **Cascade rule — Redistribute, total fixed.** Growing chord *i* by `delta`
   pulls `delta` beats from the following chords, consuming the immediate next
   chord first and rippling into later chords only when the next chord would drop
   below its 0.5-beat minimum. Shrinking chord *i* gives the freed beats back to
   the immediate next chord (it grows). Because beats only move *between existing
   chords*, the total is conserved — so the grid cap is automatically respected
   for any interior chord.
2. **Auto-commit, debounced.** Changing the Beats field redraws the timeline
   immediately (optimistic) and persists after a ~400ms debounce. No Save button
   for the beats field.

## Design

### Pure redistribution function (single source of truth)

Add `redistributeLength` to `frontend/src/chart/chartLayout.ts`:

```ts
redistributeLength(
  segments: BeatSpan[],   // ordered, contiguous
  index: number,          // the edited chord
  newLength: number,      // requested beats for chord[index]
  maxTotalBeats: number,  // total_beats(grid) — the grid cap
): { start_beat: number; end_beat: number }[]  // full new ordered windows
```

Rules (all positions snapped to half-beats, `MIN = 0.5`):

- `delta = snap(newLength) - oldLength`.
- **Grow (`delta > 0`):** walk forward from `index+1`, shrinking each following
  chord down to `MIN`, accumulating reclaimed beats until `delta` is satisfied.
  If the following chords cannot supply the full `delta`, cap growth at what is
  available (the run stays contiguous; nothing is destroyed). The edited chord's
  `end_beat` moves right by the actually-applied delta; subsequent untouched
  chords keep their lengths and shift to stay contiguous.
- **Shrink (`delta < 0`):** the immediate next chord absorbs the freed beats
  (grows). If `index` is the **last** chord, it simply ends earlier (a gap at the
  song end is allowed — total only shrinks).
- **Last chord grow:** no following chord to draw from, so cap `end_beat` at
  `maxTotalBeats`. This is the only place the grid cap is load-bearing.
- Output is the full ordered list of `{start_beat, end_beat}` windows so callers
  can both render a preview and persist the change.

This function is pure and fully unit-tested. It is the *only* place the
redistribution algorithm lives.

### Atomic batch persistence (backend)

The cascade can change several segments at once, and applying them as sequential
PATCHes trips the overlap guard mid-flight (a transient overlap) and is not
atomic. Add one endpoint that applies a whole set of windows in a single
transaction, validating the **final** state:

```
PATCH /api/charts/{chart_id}/segments  →  ChartOut
body: { segments: [{ id, start_beat, end_beat }, ...] }
```

- Every `id` must belong to the chart (404 otherwise).
- Validate the resulting full set once: each `start < end`, no pairwise overlap,
  and `max(end_beat) <= total_beats(grid) + 1e-6`. Reject the whole batch on any
  violation (422) — nothing is committed.
- Apply all windows and commit in one transaction; return the canonical
  `ChartOut`.

New Pydantic shapes in `app/schemas.py` (`SegmentWindow`, `SegmentBatchUpdate`)
and the matching request type in `frontend/src/api/types.ts`, added together per
AGENTS.md. This endpoint also makes the existing drag-resize path atomic if we
later route it here, but that re-wiring is out of scope.

### Wiring (frontend)

- `useChart.ts`: add `resizeSegments(windows)` mutation hitting the batch
  endpoint, with an **optimistic update** that writes the recomputed segments
  into the `["chart", recordingId]` cache immediately (instant timeline redraw),
  rolling back on error and invalidating on settle.
- `SegmentEditor.tsx`: the Beats `<input>` `onChange` computes
  `redistributeLength(chart.segments, index, value, maxTotalBeats)`, applies the
  optimistic cache update for the live preview, and schedules the debounced
  `resizeSegments` call (~400ms). Root/quality keep their existing single-segment
  save path. The stale local-error state for overlaps is removed.
- `ChartEditorPage.tsx` passes the chart's `maxTotalBeats` (derived from
  `duration` + `beat_times`, or already available via segment `end_time`) down so
  the editor can clamp the last chord.

## Testing (failing-first per CLAUDE.md)

1. **Pure unit tests** (`chartLayout.test.ts`) — the reproduction and the spec of
   the new behaviour:
   - grow interior chord → next chord shrinks, total + later chords unchanged,
     output contiguous and non-overlapping (this is the case that previously
     produced the overlap error);
   - grow beyond next chord's slack → ripples into the chord after;
   - grow with insufficient total slack → capped, still contiguous;
   - shrink interior chord → next chord grows, total conserved;
   - grow last chord → clamped at `maxTotalBeats`;
   - all boundaries snapped to half-beats.
2. **Backend** (`tests/`) — batch endpoint applies a redistributed set that the
   old single-PATCH would have rejected; rejects a batch whose final state
   overlaps or exceeds the grid (atomic: nothing committed); 404 on foreign id.
3. **Editor integration** (`SegmentEditor.test.tsx`, MSW) — increasing Beats no
   longer surfaces the overlap error and issues the batch resize; the timeline
   shows the new sizes. Restore/extend existing coverage.

## Out of scope

- Re-routing the drag-resize handles through the new endpoint.
- Changing how root/quality are saved.
- Any change to analysis or the grid-detection itself.

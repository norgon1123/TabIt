# Smooth Playback Bar — Design

**Date:** 2026-06-29
**Status:** Approved direction; spec under review

## Goal

Give the chart editor YouTube-grade smooth playback animation:

1. A **custom audio scrub bar** — a thin, full-width bar above the timeline that tracks the song position and is seekable by click + drag. The native `<audio controls>` player stays (for play/pause/volume).
2. The **per-chord fill bars** on the timeline glide smoothly as the playhead crosses each chord.

And remove drag-to-reorder entirely: it was an incorrect attempt to fix bad analysis at the wrong layer. After this change, **click + drag means scrubbing and nothing else.**

## The smoothness technique

YouTube's bar is smooth because the moving pixels are animated by a **CSS transition on the compositor (GPU)**, not by JavaScript on every frame. We use the same approach:

- A `currentTime` value, sourced cheaply from media events (`timeupdate`, `play`, `pause`, `seeked`, `ratechange`), drives only **discrete logic**: which chord is active, and re-arming after a seek. It does *not* drive per-frame motion.
- The colored bars move purely via CSS transitions. When playback starts we "arm" a bar — `transform: scaleX(1)` with `transition: transform <remaining>s linear` — and the GPU interpolates it on a separate thread, immune to main-thread jank. On pause / seek / rate-change we "disarm": set `transition: none` and snap the transform to the true current fraction.

This replaces the `requestAnimationFrame` loop added earlier in this branch; nothing visual is tied to the JS frame rate anymore.

Arming math (origin `left`, so `scaleX` grows rightward):
- Audio bar: target `scaleX(1)`, duration `(duration - currentTime) / rate`.
- Active chord fill: target `scaleX(1)`, duration `(chordEnd - currentTime) / rate`.

## Architecture

Each piece has one clear job and is testable in isolation.

### 1. `useMediaClock(audioRef)` — playback state hook
Wraps the `<audio>` element and exposes `{ currentTime, duration, playing, rate, seek(time) }`, sourced from media events (no rAF). `seek(time)` sets `audio.currentTime`. One job: report playback state and accept seeks. This is the single source of truth consumed by both the scrub bar and the timeline.

### 2. `<ScrubBar>` — the YouTube-style audio bar
Props: `{ currentTime, duration, playing, rate, onSeek }`.
Renders a track, a `scaleX` fill, and a draggable knob positioned at the same fraction.
- **Arming:** on `playing` true (and after seeks while playing, and on rate change) arm the CSS transition to the end. On `playing` false / seek / drag, disarm and snap.
- **Seeking (click + drag):** pointer-down on the track captures the pointer; pointer position → fraction → time. While dragging, the transition is disabled and the fill follows the pointer; on release, call `onSeek(time)`. A plain click (no movement) seeks to that point.
- Keyboard: left/right arrows nudge ±5s, for accessibility, via `onSeek`. (Small, optional — include if cheap.)

### 3. Per-chord fill (in `Timeline`)
Same arming pattern, applied to the active chord cell's fill bar:
- When a chord becomes active, arm its fill (`scaleX(1)` over the chord's remaining time). Inactive cells render an empty/zero fill.
- A **per-boundary timer** (`setTimeout` for `(chordEnd - currentTime)/rate` ms), not rAF, advances the "active chord" so the highlight switches crisply on time. The timer is cleared/reset on pause, seek, and rate change.
- On pause/seek, disarm and snap the active fill to its true fraction.

The timeline's existing behavior is otherwise unchanged: **click a chord** seeks to its start and selects it for editing; the **edge resize handles** still adjust segment boundaries. Drag-to-reorder is gone. (Drag-across-the-chart-to-scrub is intentionally *not* added now — the chord cells carry resize handles and selection; the scrub bar is the drag surface. Easy to add later if wanted.)

### 4. `ChartEditorPage` wiring
Instantiate `useMediaClock(audioRef)`, render `<ScrubBar>` above `<Timeline>`, and pass `currentTime` / `rate` / `seek` down to the timeline. Remove the rAF loop and the `reorder` wiring.

## Removal: drag-to-reorder

Delete across the stack:

**Frontend**
- `Timeline.tsx`: `draggable`, `onDragStart/Over/Drop/End`, `dropIndex` state + `dropIndexRef`, `setDrop`, `commitReorder`, the `drop-indicator` spans, and the `onReorder` prop.
- `chartLayout.ts`: `reorderIds` (and its tests in `chartLayout.test.ts`).
- `useChart.ts`: `reorderMut`, the `reorderMut.isPending` term in `isMutating`, and the `reorder` return.
- `ChartEditorPage.tsx`: `reorder` destructure, `reorderSegments`, the `onReorder` prop.
- `index.css`: the `.drop-indicator` rule and its keyframes (if unused elsewhere).
- Tests: remove the reorder cases in `Timeline.test.tsx` and `ChartEditorPage.edit.test.tsx`.

**Backend**
- `app/routers/charts.py`: the `POST /charts/{chart_id}/reorder` endpoint and its `SegmentReorder` import.
- `app/schemas.py`: `SegmentReorder`.
- `tests/test_charts.py`: the reorder tests.

## Error / edge handling

- **Unknown duration** (`duration` null/0 before metadata loads): render the bar empty and disabled; arm once `loadedmetadata` gives a duration.
- **Buffering stall** while playing: a CSS transition keeps moving even if audio stalls, briefly drifting ahead. Re-sync on the next `timeupdate`/`playing` by re-arming from the true `currentTime`. (Acceptable; matches how most web players behave.)
- **Rate change** (if the user changes playback speed): treat like a seek — disarm, then re-arm with the new `rate`.
- **Seek past end / before start:** clamp to `[0, duration]` in `seek`.
- **Component unmount / pause:** clear the boundary timer and any pending transition state.

## Testing

- `useMediaClock`: dispatch synthetic media events on a mock `<audio>`; assert exposed state and that `seek` sets `currentTime` (clamped).
- `ScrubBar`: click at x → `onSeek` with the right fraction; drag → `onSeek` on release; fill reflects fraction. (CSS-transition timing isn't asserted — jsdom has no compositor — but the arm/disarm class/style toggles are.)
- `Timeline`: active chord fill reflects fraction (assert `transform: scaleX(...)`, as already updated); inactive cells empty; reorder tests removed.
- Backend: `tests/test_charts.py` reorder tests removed; remaining chart tests still pass.

## Out of scope

- Drag-across-the-chord-chart to scrub.
- Waveform rendering, buffered-range shading, chapter markers.
- Changing the native player's controls or styling it.

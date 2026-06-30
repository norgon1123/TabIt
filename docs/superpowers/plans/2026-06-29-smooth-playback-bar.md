# Smooth Playback Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a YouTube-style, GPU-smooth audio scrub bar and smooth per-chord fill bars to the chart editor, and remove drag-to-reorder entirely.

**Architecture:** A `useMediaClock` hook is the single source of playback truth (currentTime/duration/playing/rate/seek), sourced from `<audio>` media events. The moving pixels of the scrub bar and the active chord's fill are animated by **CSS transitions on the compositor** — armed toward the end over the remaining real time while playing, snapped to the true position on pause/seek — so smoothness is independent of the JS frame rate. A per-boundary `setTimeout` switches the active chord crisply.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library + MSW (frontend); FastAPI + pytest (backend).

## Global Constraints

- Frontend tests run with `node_modules/.bin/vitest run` from `frontend/`; typecheck/build with `node_modules/.bin/tsc -b`.
- Backend tests run with the project venv: `.venv/bin/python -m pytest` (no `python` on PATH).
- MSW runs with `onUnhandledRequest: "error"` — every HTTP call a component makes in a test must have a handler. (`<audio>` `src` does not fetch in jsdom, so it needs none.)
- Pointer/seek code must guard `setPointerCapture`/`releasePointerCapture` in `try/catch` (jsdom may not implement them) and guard against a zero-width track rect.
- This branch (`worktree-smooth-playback`) has uncommitted exploratory rAF changes in three files; Task 1 resets them to a known base.

---

### Task 1: Reset exploratory rAF changes to a clean base

The branch's working tree holds an earlier rAF experiment in `ChartEditorPage.tsx`, `Timeline.tsx`, and `Timeline.test.tsx`. The new design supersedes it. Restore these three files to `HEAD` so later tasks build from the committed baseline.

**Files:**
- Modify (reset): `frontend/src/pages/ChartEditorPage.tsx`, `frontend/src/chart/Timeline.tsx`, `frontend/src/chart/Timeline.test.tsx`

- [ ] **Step 1: Reset the three files to HEAD**

```bash
git checkout HEAD -- \
  frontend/src/pages/ChartEditorPage.tsx \
  frontend/src/chart/Timeline.tsx \
  frontend/src/chart/Timeline.test.tsx
```

- [ ] **Step 2: Verify a clean working tree and green baseline**

Run: `git status --short` → Expected: no changes listed.
Run (from `frontend/`): `node_modules/.bin/vitest run`
Expected: all test files pass (baseline includes the reorder tests, which still exist at this point).

- [ ] **Step 3: No commit** (reset only; nothing new to record).

---

### Task 2: Remove drag-to-reorder — backend

Delete the `/reorder` endpoint, its schema, and its tests. Reorder was an incorrect attempt to fix bad analysis.

**Files:**
- Modify: `app/routers/charts.py` (remove endpoint + `SegmentReorder` import)
- Modify: `app/schemas.py` (remove `SegmentReorder`)
- Test: `tests/test_charts.py` (remove `_seed_three` + two reorder tests)

**Interfaces:**
- Produces: removal of `POST /api/charts/{chart_id}/reorder`.

- [ ] **Step 1: Delete the reorder tests and their helper**

Remove from `tests/test_charts.py` the helper `_seed_three` (currently lines 105–114) and the two tests `test_reorder_preserves_durations_and_recomputes_times` and `test_reorder_rejects_non_permutation` (currently lines 117–135). Leave `test_chart_access_scoped_to_owner` and everything else intact.

- [ ] **Step 2: Run the suite to confirm only reorder tests are gone**

Run: `.venv/bin/python -m pytest tests/test_charts.py -q`
Expected: PASS, with fewer tests than before; no errors about missing `_seed_three`.

- [ ] **Step 3: Delete the endpoint**

In `app/routers/charts.py`, remove the entire `@router.post("/charts/{chart_id}/reorder", ...)` function `reorder_segments` (currently lines 174–201) and remove `SegmentReorder` from the schema import block (currently around line 14).

- [ ] **Step 4: Delete the schema**

In `app/schemas.py`, remove the `class SegmentReorder(BaseModel):` block (currently lines 83–87).

- [ ] **Step 5: Verify backend is green and import-clean**

Run: `.venv/bin/python -m pytest tests/test_charts.py -q`
Expected: PASS (no `ImportError` for `SegmentReorder`).

- [ ] **Step 6: Commit**

```bash
git add app/routers/charts.py app/schemas.py tests/test_charts.py
git commit -m "feat(charts): remove segment reorder endpoint"
```

---

### Task 3: Remove drag-to-reorder — frontend (non-Timeline)

Remove the reorder helper, the mutation, and the drag CSS. (Timeline + ChartEditorPage reorder removal happen in their own rewrites in Tasks 4 and 7.)

**Files:**
- Modify: `frontend/src/chart/chartLayout.ts` (remove `reorderIds`)
- Test: `frontend/src/chart/chartLayout.test.ts` (remove `reorderIds` import + describe block)
- Modify: `frontend/src/chart/useChart.ts` (remove `reorderMut`, its `isMutating` term, and the `reorder` return)
- Modify: `frontend/src/index.css` (remove `.drop-indicator` rule + `@keyframes drop-pulse`)

**Interfaces:**
- Produces: `useChart(...)` return no longer has a `reorder` member.

- [ ] **Step 1: Remove the `reorderIds` test**

In `frontend/src/chart/chartLayout.test.ts`: change the import on line 2 from
`import { boundaryUpdates, chordsPerLine, groupIntoLines, reorderIds } from "./chartLayout";`
to
`import { boundaryUpdates, chordsPerLine, groupIntoLines } from "./chartLayout";`
and delete the entire `describe("reorderIds (round 2 #4)", () => { ... })` block (currently lines 34–47).

- [ ] **Step 2: Run that test file to confirm it fails to compile (reorderIds still exported but unused is fine; the point is the block is gone)**

Run (from `frontend/`): `node_modules/.bin/vitest run src/chart/chartLayout.test.ts`
Expected: PASS (remaining `chartLayout` tests still green).

- [ ] **Step 3: Remove `reorderIds` from `chartLayout.ts`**

Delete the `export function reorderIds(...) { ... }` block (currently lines 18–28, including its leading `// Round 2 #4:` comment).

- [ ] **Step 4: Remove the reorder mutation from `useChart.ts`**

In `frontend/src/chart/useChart.ts`:
- Delete the `reorderMut` definition:

```ts
  const reorderMut = useMutation({
    mutationFn: (segmentIds: string[]) =>
      api.postJson<ChartOut>(`/api/charts/${chartId}/reorder`, { segment_ids: segmentIds }),
    onSuccess: invalidate,
  });
```
- In the `isMutating` expression, remove the trailing `|| reorderMut.isPending` so it reads:

```ts
    isMutating:
      addMut.isPending ||
      updateMut.isPending ||
      deleteMut.isPending ||
      transposeMut.isPending,
```
- Delete the return line `reorder: (segmentIds: string[]) => reorderMut.mutateAsync(segmentIds),`.

- [ ] **Step 5: Remove the drag CSS**

In `frontend/src/index.css`, delete the `.drop-indicator { ... }` rule and the `@keyframes drop-pulse { ... }` block (currently lines 25–40, including the `/* Round 2 #4: ... */` comment).

- [ ] **Step 6: Typecheck**

Run (from `frontend/`): `node_modules/.bin/tsc -b`
Expected: PASS. (`reorderIds` has no remaining importers; `useChart` consumers are addressed in Task 7, which has not run yet — but nothing references `.reorder` except `ChartEditorPage`, which still does. Because `reorder` is just dropped from the returned object, `ChartEditorPage`'s `reorder` destructure becomes `undefined` at runtime but **still typechecks** only if its usage is also removed. To keep this task self-contained, also do Step 7.)

- [ ] **Step 7: Drop the now-dead `reorder` usage in `ChartEditorPage.tsx`**

In `frontend/src/pages/ChartEditorPage.tsx`:
- Remove `reorder,` from the `useChart(id)` destructure.
- Remove the line `const reorderSegments = (orderedIds: string[]) => reorder(orderedIds);`.
- Remove the `onReorder={reorderSegments}` prop from `<Timeline ... />`.

(Timeline still declares an `onReorder` prop until Task 4; passing nothing is fine.)

- [ ] **Step 8: Typecheck + run the chart-related tests**

Run (from `frontend/`): `node_modules/.bin/tsc -b`
Expected: PASS.
Run: `node_modules/.bin/vitest run src/chart/chartLayout.test.ts src/chart/useChart.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/chart/chartLayout.ts frontend/src/chart/chartLayout.test.ts \
  frontend/src/chart/useChart.ts frontend/src/index.css frontend/src/pages/ChartEditorPage.tsx
git commit -m "feat(chart): remove drag-to-reorder helper, mutation, and CSS"
```

---

### Task 4: Rewrite `Timeline` — remove reorder, add smooth per-chord fill

Replace the whole component: drop all drag-to-reorder handlers and the `onReorder` prop; derive the active chord with a precise boundary timer; animate the active chord's fill with a compositor CSS transition. Keep click-to-seek/select and the resize handles unchanged.

**Files:**
- Modify (full rewrite): `frontend/src/chart/Timeline.tsx`
- Test: `frontend/src/chart/Timeline.test.tsx`

**Interfaces:**
- Produces: `Timeline` props are now `{ segments, bpm, duration, currentTime, playing?, rate?, selectedId, onSelect, onSeek?, onResizeCommit? }` (no `onReorder`). `playing` defaults `false`, `rate` defaults `1`. Still re-exports `type SegmentUpdate`.
- Consumes (Task 7): `ChartEditorPage` passes `playing`, `rate`, `currentTime`, `onSeek`.

- [ ] **Step 1: Update the tests first**

Replace the body of `frontend/src/chart/Timeline.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timeline from "./Timeline";

const segments = [
  { id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
  { id: "s2", start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
];

function renderTimeline(props: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  return render(
    <Timeline
      segments={segments}
      bpm={120}
      duration={4}
      currentTime={0}
      selectedId={null}
      onSelect={() => {}}
      {...props}
    />,
  );
}

test("renders each segment's chord and roman numeral", () => {
  renderTimeline();
  expect(screen.getByText("C")).toBeInTheDocument();
  expect(screen.getByText("I")).toBeInTheDocument();
  expect(screen.getByText("G")).toBeInTheDocument();
  expect(screen.getByText("V")).toBeInTheDocument();
});

test("clicking a segment selects it and seeks to its start (#8)", async () => {
  const onSelect = vi.fn();
  const onSeek = vi.fn();
  renderTimeline({ onSelect, onSeek });
  await userEvent.click(screen.getByText("G"));
  expect(onSelect).toHaveBeenCalledWith("s2");
  expect(onSeek).toHaveBeenCalledWith(2);
});

test("highlights the chord under the playhead (#3)", () => {
  const { container } = renderTimeline({ currentTime: 3 }); // inside s2 [2,4)
  const playing = container.querySelectorAll(".playing");
  expect(playing).toHaveLength(1);
  expect(playing[0]).toHaveAttribute("data-segment-id", "s2");
});

test("renders resize handles on each edge when resizable (#2)", () => {
  renderTimeline({ onResizeCommit: vi.fn() });
  expect(screen.getByLabelText("Resize start of C")).toBeInTheDocument();
  expect(screen.getByLabelText("Resize end of C")).toBeInTheDocument();
});

test("fills the active chord's progress bar to the current fraction when paused", () => {
  const { container } = renderTimeline({ currentTime: 3 }); // halfway through s2 [2,4)
  const bar = container.querySelector('[data-segment-id="s2"] .chord-progress') as HTMLElement;
  expect(bar).toBeInTheDocument();
  // Paused: the fill snaps (no compositor transition) to the true fraction via scaleX.
  expect(bar.style.transform).toBe("scaleX(0.5)");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `node_modules/.bin/vitest run src/chart/Timeline.test.tsx`
Expected: FAIL — the old component still renders `width`, not `transform: scaleX`, and the reorder test no longer exists / props changed.

- [ ] **Step 3: Rewrite `Timeline.tsx`**

Replace the entire file with:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { SegmentOut } from "../api/types";
import { boundaryUpdates, chordsPerLine, groupIntoLines, type SegmentUpdate } from "./chartLayout";
import { clampBoundary } from "./timeMath";

export type { SegmentUpdate };

interface Props {
  segments: SegmentOut[];
  bpm: number | null;
  duration: number;
  currentTime: number;
  playing?: boolean;
  rate?: number;
  selectedId: string | null;
  onSelect: (segmentId: string) => void;
  onSeek?: (time: number) => void;
  onResizeCommit?: (updates: SegmentUpdate[]) => void;
}

// Horizontal pointer movement → time for the resize handles.
const SECONDS_PER_PIXEL = 0.02;

function chordLabel(s: SegmentOut): string {
  const q = s.chord_quality === "maj" ? "" : s.chord_quality === "min" ? "m" : s.chord_quality;
  return `${s.chord_root}${q}`;
}

export default function Timeline({
  segments,
  bpm,
  duration,
  currentTime,
  playing = false,
  rate = 1,
  selectedId,
  onSelect,
  onSeek,
  onResizeCommit,
}: Props) {
  const ordered = useMemo(
    () => [...segments].sort((a, b) => a.start_time - b.start_time),
    [segments],
  );
  const indexById = useMemo(
    () => new Map(ordered.map((s, i) => [s.id, i] as const)),
    [ordered],
  );
  const perLine = chordsPerLine(bpm);
  const lines = groupIntoLines(ordered, perLine);
  const suppressClick = useRef(false);

  // The chord under the playhead. Derived from currentTime, but a precise timer
  // advances it exactly at the chord boundary so the highlight switches on time
  // instead of waiting for the next (~4Hz) timeupdate.
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    const active =
      ordered.find((s) => currentTime >= s.start_time && currentTime < s.end_time) ?? null;
    setActiveId(active?.id ?? null);
    if (!playing || !active) return;
    const remainingMs = ((active.end_time - currentTime) / (rate || 1)) * 1000;
    const timer = window.setTimeout(() => {
      const next = ordered.find((s) => s.start_time >= active.end_time) ?? null;
      setActiveId(next?.id ?? null);
    }, Math.max(0, remainingMs));
    return () => window.clearTimeout(timer);
  }, [ordered, currentTime, playing, rate]);

  // Drive the active chord's fill with a compositor (GPU) CSS transition: arm it
  // toward 100% over the chord's remaining real time while playing, or snap it to
  // the true fraction while paused. Re-runs each timeupdate to re-sync any drift.
  const fillRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;
    const seg = ordered.find((s) => s.id === activeId);
    if (!seg) return;
    const span = Math.max(0.01, seg.end_time - seg.start_time);
    const frac = Math.min(1, Math.max(0, (currentTime - seg.start_time) / span));
    fill.style.transition = "none";
    fill.style.transform = `scaleX(${frac})`;
    if (!playing) return;
    const remaining = Math.max(0, (seg.end_time - currentTime) / (rate || 1));
    const raf = requestAnimationFrame(() => {
      fill.style.transition = `transform ${remaining}s linear`;
      fill.style.transform = "scaleX(1)";
    });
    return () => cancelAnimationFrame(raf);
  }, [activeId, ordered, currentTime, playing, rate]);

  function startResize(index: number, edge: "left" | "right", e: React.PointerEvent) {
    e.stopPropagation();
    suppressClick.current = false;
    if (!onResizeCommit) return;
    const seg = ordered[index];
    const left = edge === "left" ? ordered[index - 1] : seg;
    const right = edge === "left" ? seg : ordered[index + 1];
    const oldBoundary = edge === "left" ? seg.start_time : seg.end_time;
    const lower = left ? left.start_time : 0;
    const upper = right ? right.end_time : duration || seg.end_time;
    const startX = e.clientX;

    const move = (ev: PointerEvent) => {
      ev.preventDefault();
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      suppressClick.current = true;
      const dt = (ev.clientX - startX) * SECONDS_PER_PIXEL;
      const boundary = clampBoundary(oldBoundary + dt, lower, upper);
      const updates = boundaryUpdates(left, right, oldBoundary, boundary);
      if (updates.length) onResizeCommit(updates);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", justifyContent: "flex-start", gap: 0 }}>
          {line.map((s) => {
            const i = indexById.get(s.id)!;
            const selected = s.id === selectedId;
            const isActive = s.id === activeId;
            const span = Math.max(0.01, s.end_time - s.start_time);
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                className={["chord-cell", isActive && "playing", selected && "selected"]
                  .filter(Boolean)
                  .join(" ")}
                data-segment-id={s.id}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onSelect(s.id);
                  onSeek?.(s.start_time);
                }}
                style={{
                  position: "relative",
                  flex: `${span} 1 0`,
                  minWidth: 56,
                  height: 64,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  overflow: "hidden",
                  border: selected ? "2px solid var(--accent)" : "1px solid #2c313a",
                  background: isActive ? "#26303f" : "var(--panel)",
                }}
              >
                {onResizeCommit && (
                  <span
                    aria-label={`Resize start of ${chordLabel(s)}`}
                    draggable={false}
                    onPointerDown={(e) => startResize(i, "left", e)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
                  />
                )}
                <strong>{chordLabel(s)}</strong>
                <span className="muted">{s.roman_numeral}</span>
                {onResizeCommit && (
                  <span
                    aria-label={`Resize end of ${chordLabel(s)}`}
                    draggable={false}
                    onPointerDown={(e) => startResize(i, "right", e)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
                  />
                )}
                {isActive && (
                  <span
                    ref={fillRef}
                    aria-hidden
                    className="chord-progress"
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      height: 4,
                      width: "100%",
                      transformOrigin: "left",
                      transform: "scaleX(0)",
                      background: "var(--accent)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `node_modules/.bin/vitest run src/chart/Timeline.test.tsx`
Expected: PASS (all five tests).

- [ ] **Step 5: Typecheck**

Run (from `frontend/`): `node_modules/.bin/tsc -b`
Expected: PASS. (`ChartEditorPage` no longer passes `onReorder`, removed in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/chart/Timeline.tsx frontend/src/chart/Timeline.test.tsx
git commit -m "feat(timeline): smooth per-chord fill, remove drag-to-reorder"
```

---

### Task 5: `useMediaClock` hook

A hook that owns the `<audio>` element via a callback ref and reports playback state from media events (no rAF). Single source of truth for currentTime/duration/playing/rate, plus a clamped `seek`.

**Files:**
- Create: `frontend/src/chart/useMediaClock.ts`
- Test: `frontend/src/chart/useMediaClock.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface MediaClock {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  seek: (time: number) => void;
  ref: (el: HTMLAudioElement | null) => void;
}
export function useMediaClock(): MediaClock;
```

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/chart/useMediaClock.test.tsx`:

```tsx
import { render, fireEvent, act } from "@testing-library/react";
import { useMediaClock, type MediaClock } from "./useMediaClock";

function setProp(el: HTMLMediaElement, name: string, value: number) {
  Object.defineProperty(el, name, { value, configurable: true });
}

test("reports duration, currentTime, and play state from media events", () => {
  let clock!: MediaClock;
  function Harness() {
    clock = useMediaClock();
    return <audio ref={clock.ref} data-testid="audio" />;
  }
  const { getByTestId } = render(<Harness />);
  const el = getByTestId("audio") as HTMLAudioElement;

  setProp(el, "duration", 12);
  fireEvent(el, new Event("durationchange"));
  setProp(el, "currentTime", 4);
  fireEvent(el, new Event("timeupdate"));
  fireEvent(el, new Event("play"));

  expect(clock.duration).toBe(12);
  expect(clock.currentTime).toBe(4);
  expect(clock.playing).toBe(true);

  fireEvent(el, new Event("pause"));
  expect(clock.playing).toBe(false);
});

test("seek clamps to [0, duration] and updates currentTime", () => {
  let clock!: MediaClock;
  let ct = 0;
  function Harness() {
    clock = useMediaClock();
    return <audio ref={clock.ref} data-testid="audio" />;
  }
  const { getByTestId } = render(<Harness />);
  const el = getByTestId("audio") as HTMLAudioElement;
  Object.defineProperty(el, "currentTime", {
    get: () => ct,
    set: (v: number) => {
      ct = v;
    },
    configurable: true,
  });
  setProp(el, "duration", 10);
  fireEvent(el, new Event("durationchange"));

  act(() => clock.seek(999));
  expect(ct).toBe(10);
  expect(clock.currentTime).toBe(10);

  act(() => clock.seek(-5));
  expect(ct).toBe(0);
  expect(clock.currentTime).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `node_modules/.bin/vitest run src/chart/useMediaClock.test.tsx`
Expected: FAIL — module `./useMediaClock` does not exist.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/chart/useMediaClock.ts`:

```ts
import { useCallback, useRef, useState } from "react";

export interface MediaClock {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  seek: (time: number) => void;
  /** Callback ref to attach to the <audio> element. */
  ref: (el: HTMLAudioElement | null) => void;
}

// Single source of playback truth. Reads state from media events (no rAF); the
// smooth motion lives in the consumers' CSS transitions.
export function useMediaClock(): MediaClock {
  const elRef = useRef<HTMLAudioElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  const ref = useCallback((el: HTMLAudioElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    elRef.current = el;
    if (!el) return;

    const onTime = () => setCurrentTime(el.currentTime);
    const onDuration = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onRate = () => setRate(el.playbackRate || 1);

    const pairs: Array<[string, () => void]> = [
      ["timeupdate", onTime],
      ["seeked", onTime],
      ["loadedmetadata", onDuration],
      ["durationchange", onDuration],
      ["play", onPlay],
      ["playing", onPlay],
      ["pause", onPause],
      ["ended", onPause],
      ["ratechange", onRate],
    ];
    for (const [name, fn] of pairs) el.addEventListener(name, fn);
    // Initialize from current element state (covers already-loaded media).
    onDuration();
    onRate();
    onTime();

    cleanupRef.current = () => {
      for (const [name, fn] of pairs) el.removeEventListener(name, fn);
    };
  }, []);

  const seek = useCallback(
    (time: number) => {
      const el = elRef.current;
      const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
      const clamped = Math.max(0, Math.min(max, time));
      if (el) el.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [duration],
  );

  return { currentTime, duration, playing, rate, seek, ref };
}
```

- [ ] **Step 4: Run to verify it passes**

Run (from `frontend/`): `node_modules/.bin/vitest run src/chart/useMediaClock.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart/useMediaClock.ts frontend/src/chart/useMediaClock.test.tsx
git commit -m "feat(chart): add useMediaClock playback-state hook"
```

---

### Task 6: `ScrubBar` component

A thin, full-width, seekable bar. Fill + knob are armed with a compositor CSS transition toward the end while playing, and snapped while paused or dragging. Click + drag scrubs via pointer capture.

**Files:**
- Create: `frontend/src/chart/ScrubBar.tsx`
- Test: `frontend/src/chart/ScrubBar.test.tsx`
- Modify: `frontend/src/index.css` (focus outline for the bar)

**Interfaces:**
- Consumes: `MediaClock` fields via props.
- Produces:

```ts
interface ScrubBarProps {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  onSeek: (time: number) => void;
}
export default function ScrubBar(props: ScrubBarProps): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/chart/ScrubBar.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import ScrubBar from "./ScrubBar";

function mockRect(el: Element, left: number, width: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    width,
    top: 0,
    right: left + width,
    bottom: 14,
    height: 14,
    x: left,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
}

test("clicking the track seeks to that fraction of the duration", () => {
  const onSeek = vi.fn();
  render(<ScrubBar currentTime={0} duration={10} playing={false} rate={1} onSeek={onSeek} />);
  const slider = screen.getByRole("slider");
  mockRect(slider, 0, 200);
  fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
  expect(onSeek).toHaveBeenCalledWith(5);
});

test("dragging scrubs continuously", () => {
  const onSeek = vi.fn();
  render(<ScrubBar currentTime={0} duration={10} playing={false} rate={1} onSeek={onSeek} />);
  const slider = screen.getByRole("slider");
  mockRect(slider, 0, 200);
  fireEvent.pointerDown(slider, { clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(slider, { clientX: 150, pointerId: 1 });
  expect(onSeek).toHaveBeenLastCalledWith(7.5);
});

test("reflects the current fraction on the fill when paused", () => {
  const { container } = render(
    <ScrubBar currentTime={5} duration={10} playing={false} rate={1} onSeek={() => {}} />,
  );
  const fill = container.querySelector(".scrub-fill") as HTMLElement;
  expect(fill.style.transform).toBe("scaleX(0.5)");
});

test("ignores seeks before duration is known", () => {
  const onSeek = vi.fn();
  render(<ScrubBar currentTime={0} duration={0} playing={false} rate={1} onSeek={onSeek} />);
  const slider = screen.getByRole("slider");
  mockRect(slider, 0, 200);
  fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
  expect(onSeek).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `node_modules/.bin/vitest run src/chart/ScrubBar.test.tsx`
Expected: FAIL — module `./ScrubBar` does not exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/chart/ScrubBar.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";

interface ScrubBarProps {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  onSeek: (time: number) => void;
}

export default function ScrubBar({ currentTime, duration, playing, rate, onSeek }: ScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const frac = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  // Arm a compositor CSS transition toward the end while playing; snap to the
  // true position while paused or dragging. Re-runs each timeupdate to re-sync.
  useEffect(() => {
    const fill = fillRef.current;
    const knob = knobRef.current;
    if (!fill || !knob) return;
    fill.style.transition = "none";
    knob.style.transition = "none";
    fill.style.transform = `scaleX(${frac})`;
    knob.style.left = `${frac * 100}%`;
    if (dragging || !playing || duration <= 0) return;
    const remaining = Math.max(0, (duration - currentTime) / (rate || 1));
    const raf = requestAnimationFrame(() => {
      fill.style.transition = `transform ${remaining}s linear`;
      knob.style.transition = `left ${remaining}s linear`;
      fill.style.transform = "scaleX(1)";
      knob.style.left = "100%";
    });
    return () => cancelAnimationFrame(raf);
  }, [frac, currentTime, duration, playing, rate, dragging]);

  function fracFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (duration <= 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not supported (e.g. jsdom) */
    }
    setDragging(true);
    onSeek(fracFromClientX(e.clientX) * duration);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || duration <= 0) return;
    onSeek(fracFromClientX(e.clientX) * duration);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not supported (e.g. jsdom) */
    }
    setDragging(false);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (duration <= 0) return;
    if (e.key === "ArrowRight") onSeek(currentTime + 5);
    else if (e.key === "ArrowLeft") onSeek(currentTime - 5);
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
      tabIndex={0}
      className="scrub-bar"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      style={{ position: "relative", height: 14, cursor: "pointer", touchAction: "none" }}
    >
      <div
        aria-hidden
        style={{ position: "absolute", left: 0, right: 0, top: 6, height: 4, background: "#2c313a", borderRadius: 2 }}
      />
      <div
        ref={fillRef}
        aria-hidden
        className="scrub-fill"
        style={{
          position: "absolute",
          left: 0,
          top: 6,
          height: 4,
          width: "100%",
          transformOrigin: "left",
          transform: `scaleX(${frac})`,
          background: "var(--accent)",
          borderRadius: 2,
        }}
      />
      <div
        ref={knobRef}
        aria-hidden
        className="scrub-knob"
        style={{
          position: "absolute",
          top: 2,
          left: `${frac * 100}%`,
          width: 10,
          height: 10,
          marginLeft: -5,
          borderRadius: "50%",
          background: "var(--accent)",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Add a focus outline (CSS)**

Append to `frontend/src/index.css`:

```css
.scrub-bar:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 5: Run to verify it passes**

Run (from `frontend/`): `node_modules/.bin/vitest run src/chart/ScrubBar.test.tsx`
Expected: PASS (all four tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/chart/ScrubBar.tsx frontend/src/chart/ScrubBar.test.tsx frontend/src/index.css
git commit -m "feat(chart): add seekable compositor-smooth ScrubBar"
```

---

### Task 7: Wire `useMediaClock` + `ScrubBar` into `ChartEditorPage`

Replace the local `currentTime`/`audioRef` plumbing with `useMediaClock`; attach the clock to the native `<audio>`; render `ScrubBar` above the timeline; pass `playing`/`rate`/`currentTime`/`seek` into `Timeline`.

**Files:**
- Modify (rewrite): `frontend/src/pages/ChartEditorPage.tsx`
- Test: `frontend/src/pages/ChartEditorPage.edit.test.tsx` (remove the reorder test)

**Interfaces:**
- Consumes: `useMediaClock` (Task 5), `ScrubBar` (Task 6), `Timeline` new props (Task 4).

- [ ] **Step 1: Remove the reorder test**

In `frontend/src/pages/ChartEditorPage.edit.test.tsx`, delete the entire test `test("dragging a chord past another posts the new order to /reorder (round 2 #4)", ...)` (currently lines 38–69). Leave the PATCH-save and transpose tests intact.

- [ ] **Step 2: Run the edit tests to confirm they still pass at this point**

Run (from `frontend/`): `node_modules/.bin/vitest run src/pages/ChartEditorPage.edit.test.tsx`
Expected: PASS (the remaining tests; the page still renders the old `<audio onTimeUpdate>` until Step 3).

- [ ] **Step 3: Rewrite `ChartEditorPage.tsx`**

Replace the entire file with:

```tsx
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RecordingOut } from "../api/types";
import { useChart } from "../chart/useChart";
import { useMediaClock } from "../chart/useMediaClock";
import Timeline, { type SegmentUpdate } from "../chart/Timeline";
import ScrubBar from "../chart/ScrubBar";
import SegmentEditor from "../chart/SegmentEditor";
import TransposeControl from "../chart/TransposeControl";

export default function ChartEditorPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const id = recordingId!;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clock = useMediaClock();

  const recordingQuery = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.get<RecordingOut>(`/api/recordings/${id}`),
  });
  const {
    chart,
    isLoading: chartLoading,
    isMutating,
    addSegment,
    updateSegment,
    deleteSegment,
    transpose,
  } = useChart(id);

  const recording = recordingQuery.data;
  const analysis = recording?.analysis ?? null;
  const duration = recording?.duration_seconds ?? 0;

  const applyResize = async (updates: SegmentUpdate[]) => {
    for (const u of updates) await updateSegment(u.id, u.patch); // ordered: shrink before grow
  };

  if (recordingQuery.isLoading || chartLoading) return <p className="muted container">Loading…</p>;

  return (
    <div className="container">
      <p><Link to="/">← Library</Link></p>
      <h1>{recording?.original_filename ?? "Chart"}</h1>

      {analysis?.status === "failed" && (
        <p className="error">Analysis failed: {analysis.error}</p>
      )}

      {!chart && analysis?.status !== "failed" && (
        <p className="muted">Analyzing… the chart will appear when analysis finishes.</p>
      )}

      {chart && (
        <>
          <p className="muted">
            {analysis?.bpm != null && <>{Math.round(analysis.bpm)} BPM · </>}
            Key: {chart.key_tonic} {chart.key_mode}
          </p>

          <audio
            ref={clock.ref}
            controls
            style={{ width: "100%" }}
            src={`/api/recordings/${id}/audio`}
          />

          <div style={{ marginTop: 8 }}>
            <ScrubBar
              currentTime={clock.currentTime}
              duration={clock.duration || duration}
              playing={clock.playing}
              rate={clock.rate}
              onSeek={clock.seek}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <Timeline
              segments={chart.segments}
              bpm={analysis?.bpm ?? null}
              duration={duration}
              currentTime={clock.currentTime}
              playing={clock.playing}
              rate={clock.rate}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSeek={clock.seek}
              onResizeCommit={applyResize}
            />
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <TransposeControl
              keyLabel={`${chart.key_tonic} ${chart.key_mode}`}
              onTranspose={(semitones) => transpose(semitones)}
              busy={isMutating}
            />

            <button
              disabled={isMutating}
              onClick={() => {
                const lastEnd = chart.segments[chart.segments.length - 1]?.end_time ?? 0;
                addSegment({
                  start_time: lastEnd,
                  end_time: Math.min(duration || lastEnd + 1, lastEnd + 1),
                  chord_root: chart.key_tonic,
                  chord_quality: "maj",
                });
              }}
            >
              Add segment
            </button>

            {selectedId && chart.segments.find((s) => s.id === selectedId) && (
              <SegmentEditor
                segment={chart.segments.find((s) => s.id === selectedId)!}
                onSave={(patch) => updateSegment(selectedId, patch).then(() => undefined)}
                onDelete={() => {
                  deleteSegment(selectedId);
                  setSelectedId(null);
                }}
                busy={isMutating}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run (from `frontend/`): `node_modules/.bin/tsc -b`
Expected: PASS.

- [ ] **Step 5: Run the page tests**

Run (from `frontend/`): `node_modules/.bin/vitest run src/pages/ChartEditorPage.test.tsx src/pages/ChartEditorPage.edit.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite + typecheck + backend suite**

Run (from `frontend/`): `node_modules/.bin/vitest run` → Expected: all pass.
Run (from `frontend/`): `node_modules/.bin/tsc -b` → Expected: PASS.
Run (from repo root): `.venv/bin/python -m pytest -q` → Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ChartEditorPage.tsx frontend/src/pages/ChartEditorPage.edit.test.tsx
git commit -m "feat(chart-editor): wire useMediaClock + ScrubBar, smooth playback"
```

---

## Self-Review

**Spec coverage:**
- Custom audio scrub bar (thin, full-width, click+drag) → Task 6 (`ScrubBar`) + Task 7 (wiring). ✓
- Native player kept → Task 7 keeps `<audio controls>`. ✓
- Smooth per-chord fills via compositor CSS transitions → Task 4. ✓
- `currentTime` drives only discrete logic; motion via CSS transition → Tasks 4/6 arm-on-play, snap-on-pause; `useMediaClock` event-sourced (no rAF) → Task 5. ✓
- Per-boundary timer for crisp active-chord switching → Task 4. ✓
- `useMediaClock` / `ScrubBar` / per-chord fill as separate testable units → Tasks 5/6/4. ✓
- Remove drag-to-reorder across stack → Task 2 (backend), Task 3 (chartLayout/useChart/CSS), Task 4 (Timeline), Task 7 (ChartEditorPage + edit test). ✓
- Edge cases: unknown duration (ScrubBar guards `duration <= 0`, falls back to recording duration in wiring); rate change (arming divides by `rate`); seek clamping (`useMediaClock.seek`); unmount/pause clears timers (effect cleanups). ✓
- Out of scope (drag-across-chart-to-scrub, waveform) → not included. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. ✓

**Type consistency:** `MediaClock` shape (`currentTime`, `duration`, `playing`, `rate`, `seek`, `ref`) is identical in Task 5's definition and Tasks 6/7's consumption. `Timeline` prop set (with `playing?`, `rate?`, no `onReorder`) matches between Task 4's definition and Task 7's usage. `ScrubBarProps` matches between Task 6 and Task 7. ✓

## Out of Scope

- Drag-across-the-chord-chart to scrub.
- Waveform rendering, buffered-range shading, chapter markers.
- Restyling the native player's controls.

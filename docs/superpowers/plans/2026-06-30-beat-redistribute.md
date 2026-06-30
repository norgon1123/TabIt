# Beat-count Redistribute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editing a chord's beat count redistributes beats with the following chords (total conserved, no overlap error) and the timeline resizes instantly while the save is debounced.

**Architecture:** A pure `redistributeLength` function computes the new contiguous beat windows. A new atomic backend endpoint applies a whole set of windows in one transaction, validating the final state. The editor calls it through an optimistic TanStack-Query mutation so the timeline redraws immediately, debouncing the network write.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + TanStack Query + Vitest/Testing-Library/MSW (frontend).

## Global Constraints

- All start/end times are **millisecond precision**; beat positions snap to **half-beats** (`snapHalfBeat`, `MIN = 0.5`).
- A chart's total length must **never exceed** the recording's beat grid (`total_beats(grid, duration)`).
- New API fields update `app/schemas.py` **and** `frontend/src/api/types.ts` together.
- Keep `Analysis` immutable; only `ChordSegment` rows are mutated.
- Backend tests: `pytest`. Frontend tests: `cd frontend && npm test`. Type-check: `cd frontend && npm run build`.

---

### Task 1: Pure `redistributeLength` function

**Files:**
- Modify: `frontend/src/chart/chartLayout.ts`
- Test: `frontend/src/chart/chartLayout.test.ts`

**Interfaces:**
- Consumes: `snapHalfBeat` from `./beatMath`.
- Produces: `redistributeLength(segments: BeatSpan[], index: number, newLength: number, maxTotalBeats: number): { start_beat: number; end_beat: number }[]` — full ordered window list; total conserved for interior chords; last chord clamped at `maxTotalBeats`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/chart/chartLayout.test.ts`:

```ts
import { redistributeLength } from "./chartLayout";

const span = (s: number, e: number) => ({ start_beat: s, end_beat: e });
const lens = (w: { start_beat: number; end_beat: number }[]) =>
  w.map((x) => x.end_beat - x.start_beat);
const contiguous = (w: { start_beat: number; end_beat: number }[]) =>
  w.every((x, i) => i === 0 || Math.abs(x.start_beat - w[i - 1].end_beat) < 1e-9);

describe("redistributeLength", () => {
  const ABC = () => [span(0, 4), span(4, 8), span(8, 12)];

  test("growing an interior chord shrinks the next, total + later chords unchanged", () => {
    const out = redistributeLength(ABC(), 0, 6, 20);
    expect(lens(out)).toEqual([6, 2, 4]); // B gives 2 to A; C untouched
    expect(out[2].end_beat).toBe(12); // total conserved
    expect(contiguous(out)).toBe(true);
  });

  test("growing past the next chord's slack ripples into the chord after", () => {
    const out = redistributeLength([span(0, 4), span(4, 5), span(5, 9)], 0, 8, 20);
    expect(lens(out)).toEqual([8, 0.5, 0.5]); // B floored at 0.5, rest taken from C
    expect(out[2].end_beat).toBe(9); // total conserved
    expect(contiguous(out)).toBe(true);
  });

  test("growth is capped at the followers' available slack", () => {
    const out = redistributeLength(ABC(), 0, 20, 20);
    expect(lens(out)).toEqual([11, 0.5, 0.5]); // 7 beats of slack max
    expect(out[2].end_beat).toBe(12);
  });

  test("shrinking an interior chord gives beats to the next, total conserved", () => {
    const out = redistributeLength(ABC(), 0, 2, 20);
    expect(lens(out)).toEqual([2, 6, 4]);
    expect(out[2].end_beat).toBe(12);
    expect(contiguous(out)).toBe(true);
  });

  test("growing the last chord is clamped at maxTotalBeats", () => {
    const out = redistributeLength(ABC(), 2, 20, 14);
    expect(out[2].end_beat).toBe(14); // clamped to the grid
  });

  test("snaps the requested length to the nearest half-beat", () => {
    const out = redistributeLength(ABC(), 0, 5.3, 20); // 5.3 -> 5.5
    expect(lens(out)[0]).toBe(5.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/chart/chartLayout.test.ts`
Expected: FAIL — `redistributeLength is not a function` / not exported.

- [ ] **Step 3: Implement `redistributeLength`**

In `frontend/src/chart/chartLayout.ts`, add the import at the top and the function at the end:

```ts
import { snapHalfBeat } from "./beatMath";

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
    const target = Math.max(
      MIN_BEATS,
      Math.min(snapHalfBeat(newLength), snapHalfBeat(maxTotalBeats - edited.start_beat)),
    );
    edited.end_beat = snapHalfBeat(edited.start_beat + target);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/chart/chartLayout.test.ts`
Expected: PASS (all redistributeLength cases plus the existing groupIntoLines/boundaryUpdates tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart/chartLayout.ts frontend/src/chart/chartLayout.test.ts
git commit -m "feat(chart): redistributeLength conserves total when resizing a chord"
```

---

### Task 2: Frontend beat-grid helper (`totalBeats`)

**Files:**
- Create: `frontend/src/chart/beatGrid.ts`
- Test: `frontend/src/chart/beatGrid.test.ts`

**Interfaces:**
- Produces: `totalBeats(beatTimes: number[], bpm: number | null, duration: number): number` — the maximum end_beat the chart may reach. Mirrors `app/audio/beatgrid.py` (`ensure_grid` + `beat_for_time(duration)`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/chart/beatGrid.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { totalBeats } from "./beatGrid";

describe("totalBeats", () => {
  test("synthesizes a 120 BPM grid when no beat times are present (0.5s/beat)", () => {
    // 10s at 120 BPM -> 20 beats.
    expect(totalBeats([], null, 10)).toBeCloseTo(20, 6);
  });

  test("uses the provided bpm to synthesize the grid", () => {
    // 60 BPM -> 1s/beat -> 10 beats over 10s.
    expect(totalBeats([], 60, 10)).toBeCloseTo(10, 6);
  });

  test("interpolates within a detected grid", () => {
    // beats at 0,1,2,3s; duration 2.5s -> beat 2.5.
    expect(totalBeats([0, 1, 2, 3], 120, 2.5)).toBeCloseTo(2.5, 6);
  });

  test("extrapolates past the last detected onset using the final interval", () => {
    // last interval 1s; duration 5s, grid ends at 3 (beat 3) -> 3 + 2 = 5.
    expect(totalBeats([0, 1, 2, 3], 120, 5)).toBeCloseTo(5, 6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/chart/beatGrid.test.ts`
Expected: FAIL — cannot find module `./beatGrid`.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/chart/beatGrid.ts`:

```ts
// Port of app/audio/beatgrid.py: convert the recording duration into the maximum
// end_beat the chart may reach. A grid is an ascending list of beat-onset seconds.
const DEFAULT_BPM = 120;

function ensureGrid(beatTimes: number[], bpm: number | null, duration: number): number[] {
  const clean = [...beatTimes].map(Number).sort((a, b) => a - b);
  if (clean.length >= 2) return clean;
  const tempo = bpm && bpm > 0 ? bpm : DEFAULT_BPM;
  const interval = 60 / tempo;
  const span = Math.max(duration, interval * 2);
  const n = Math.floor(span / interval) + 2;
  return Array.from({ length: n }, (_, i) => i * interval);
}

function intervalAt(grid: number[], i: number): number {
  const step =
    i >= 0 && i < grid.length - 1 ? grid[i + 1] - grid[i] : grid[grid.length - 1] - grid[grid.length - 2];
  return step > 0 ? step : 60 / DEFAULT_BPM;
}

export function totalBeats(beatTimes: number[], bpm: number | null, duration: number): number {
  const grid = ensureGrid(beatTimes, bpm, duration);
  if (duration <= grid[0]) return 0;
  const last = grid.length - 1;
  if (duration >= grid[last]) return last + (duration - grid[last]) / intervalAt(grid, last);
  let i = 0;
  while (i < last && grid[i + 1] <= duration) i += 1;
  return i + (duration - grid[i]) / intervalAt(grid, i);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/chart/beatGrid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart/beatGrid.ts frontend/src/chart/beatGrid.test.ts
git commit -m "feat(chart): totalBeats grid helper mirroring backend beatgrid"
```

---

### Task 3: Atomic batch-resize backend endpoint

**Files:**
- Modify: `app/schemas.py` (add `SegmentWindow`, `SegmentBatchUpdate`)
- Modify: `app/routers/charts.py` (add `resize_segments` route + import)
- Test: `tests/test_charts.py`

**Interfaces:**
- Consumes: existing `_owned_chart`, `_chart_grid`, `_chart_out`, `total_beats`.
- Produces: `PATCH /api/charts/{chart_id}/segments` body `{ "segments": [{ "id", "start_beat", "end_beat" }, ...] }` → `ChartOut`. Validates the resulting full set atomically (404 unknown id; 422 on `start>=end`, overlap, or grid overflow); commits all or nothing.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_charts.py`:

```python
def _three_segments(client, chart_id):
    ids = []
    for root, sb, eb in (("C", 0.0, 4.0), ("F", 4.0, 8.0), ("G", 8.0, 12.0)):
        ids.append(client.post(
            f"/api/charts/{chart_id}/segments",
            json={"start_beat": sb, "end_beat": eb, "chord_root": root, "chord_quality": "maj"},
        ).json()["id"])
    return ids
```

```python
def test_batch_resize_applies_redistributed_windows(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # duration 10s -> 20 beats
    a, b, c = _three_segments(client, chart_id)
    # Grow A to 6 by taking 2 from B — the single-PATCH path would 422 on overlap.
    resp = client.patch(f"/api/charts/{chart_id}/segments", json={"segments": [
        {"id": a, "start_beat": 0.0, "end_beat": 6.0},
        {"id": b, "start_beat": 6.0, "end_beat": 8.0},
    ]})
    assert resp.status_code == 200
    spans = {s["chord_root"]: (s["start_beat"], s["end_beat"]) for s in resp.json()["segments"]}
    assert spans["C"] == (0.0, 6.0)
    assert spans["F"] == (6.0, 8.0)
    assert spans["G"] == (8.0, 12.0)


def test_batch_resize_rejects_overlapping_final_state_atomically(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    a, b, c = _three_segments(client, chart_id)
    resp = client.patch(f"/api/charts/{chart_id}/segments", json={"segments": [
        {"id": a, "start_beat": 0.0, "end_beat": 6.0},  # overlaps B, which is unchanged
    ]})
    assert resp.status_code == 422
    # Nothing committed.
    spans = {s["chord_root"]: s["end_beat"] for s in client.get(f"/api/recordings/{rec_id}/chart").json()["segments"]}
    assert spans["C"] == 4.0


def test_batch_resize_rejects_beyond_grid(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # 20 beats max
    a, b, c = _three_segments(client, chart_id)
    resp = client.patch(f"/api/charts/{chart_id}/segments", json={"segments": [
        {"id": c, "start_beat": 8.0, "end_beat": 999.0},
    ]})
    assert resp.status_code == 422


def test_batch_resize_unknown_segment_404(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    _three_segments(client, chart_id)
    resp = client.patch(f"/api/charts/{chart_id}/segments", json={"segments": [
        {"id": "nope", "start_beat": 0.0, "end_beat": 2.0},
    ]})
    assert resp.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/pytest tests/test_charts.py -k batch_resize -v`
Expected: FAIL — the route does not exist (405/404 from the router).

- [ ] **Step 3: Add the schemas**

In `app/schemas.py`, after `class SegmentUpdate` (around line 61) add:

```python
class SegmentWindow(BaseModel):
    id: str
    start_beat: float = Field(ge=0)
    end_beat: float = Field(gt=0)


class SegmentBatchUpdate(BaseModel):
    segments: list[SegmentWindow] = Field(min_length=1)
```

- [ ] **Step 4: Add the route**

In `app/routers/charts.py`, add `SegmentBatchUpdate` to the schema import block (lines 10-18), then add this route after `update_segment` (after line 167):

```python
@router.patch("/charts/{chart_id}/segments", response_model=ChartOut)
def resize_segments(
    chart_id: str,
    payload: SegmentBatchUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    chart = _owned_chart(db, user, chart_id)
    by_id = {s.id: s for s in chart.segments}
    for w in payload.segments:
        if w.id not in by_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
        if w.start_beat >= w.end_beat:
            raise HTTPException(status_code=422, detail="start_beat must be before end_beat")

    # Validate the resulting FULL set (requested windows layered over current ones).
    windows = {s.id: (s.start_beat, s.end_beat) for s in chart.segments}
    for w in payload.segments:
        windows[w.id] = (w.start_beat, w.end_beat)
    ordered = sorted(windows.values())
    for (s1, e1), (s2, e2) in zip(ordered, ordered[1:]):
        if s1 < e2 and e1 > s2:
            raise HTTPException(status_code=422, detail="segment overlaps an existing segment")
    grid, duration = _chart_grid(chart)
    if duration and ordered and ordered[-1][1] > total_beats(grid, duration) + 1e-6:
        raise HTTPException(status_code=422, detail="end_beat exceeds the chart's beat grid")

    for w in payload.segments:
        seg = by_id[w.id]
        seg.start_beat = w.start_beat
        seg.end_beat = w.end_beat
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/bin/pytest tests/test_charts.py -v`
Expected: PASS (the four new `batch_resize` tests plus the existing chart tests).

- [ ] **Step 6: Commit**

```bash
git add app/schemas.py app/routers/charts.py tests/test_charts.py
git commit -m "feat(charts): atomic batch segment-resize endpoint"
```

---

### Task 4: `resizeSegments` optimistic mutation + API type

**Files:**
- Modify: `frontend/src/api/types.ts` (add `SegmentWindowInput`)
- Modify: `frontend/src/chart/useChart.ts`
- Test: `frontend/src/chart/useChart.test.tsx`

**Interfaces:**
- Consumes: `redistributeLength` (Task 1), the `PATCH /api/charts/{id}/segments` endpoint (Task 3).
- Produces: `useChart(...).resizeSegments(windows: SegmentWindowInput[]): Promise<ChartOut>`, where `SegmentWindowInput = { id: string; start_beat: number; end_beat: number }`. Optimistically rewrites the `["chart", recordingId]` cache (instant timeline redraw), rolls back on error, invalidates on settle. `isMutating` includes it.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/chart/useChart.test.tsx`:

```tsx
const CHART_BEATS = {
  id: "c1", recording_id: "r1", key_tonic: "C", key_mode: "major",
  beats_per_measure: 4, measure_offset: 0, beat_times: [],
  segments: [
    { id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
    { id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4, chord_root: "F", chord_quality: "maj", roman_numeral: "IV" },
  ],
};

test("resizeSegments posts the windows and optimistically updates the cache", async () => {
  let body: unknown = null;
  server.use(
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART_BEATS)),
    http.patch("/api/charts/c1/segments", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(CHART_BEATS);
    }),
  );
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.chart).not.toBeNull());

  const windows = [
    { id: "s1", start_beat: 0, end_beat: 6 },
    { id: "s2", start_beat: 6, end_beat: 8 },
  ];
  const promise = result.current.resizeSegments(windows);
  // Optimistic: the cache reflects the new beats before the request resolves.
  await waitFor(() => expect(result.current.chart!.segments[0].end_beat).toBe(6));
  await promise;
  expect(body).toEqual({ segments: windows });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/chart/useChart.test.tsx`
Expected: FAIL — `result.current.resizeSegments is not a function`.

- [ ] **Step 3: Add the API type**

In `frontend/src/api/types.ts`, after `SegmentOut` add:

```ts
export interface SegmentWindowInput {
  id: string;
  start_beat: number;
  end_beat: number;
}
```

- [ ] **Step 4: Implement the mutation**

In `frontend/src/chart/useChart.ts`, import the new type and add the mutation. Update the import line:

```ts
import type { ChartOut, SegmentOut, SegmentWindowInput } from "../api/types";
```

Add after `settingsMut` (after line 57):

```ts
  const resizeMut = useMutation({
    mutationFn: (windows: SegmentWindowInput[]) =>
      api.patchJson<ChartOut>(`/api/charts/${chartId}/segments`, { segments: windows }),
    onMutate: async (windows: SegmentWindowInput[]) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ChartOut | null>(key);
      if (prev) {
        const byId = new Map(windows.map((w) => [w.id, w]));
        queryClient.setQueryData<ChartOut>(key, {
          ...prev,
          segments: prev.segments.map((s) => {
            const w = byId.get(s.id);
            return w ? { ...s, start_beat: w.start_beat, end_beat: w.end_beat } : s;
          }),
        });
      }
      return { prev };
    },
    onError: (_e, _w, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: invalidate,
  });
```

Add `resizeMut.isPending ||` to the `isMutating` expression (around line 63), and add to the returned object (after `updateSettings`, line 73):

```ts
    resizeSegments: (windows: SegmentWindowInput[]) => resizeMut.mutateAsync(windows),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/chart/useChart.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/chart/useChart.ts frontend/src/chart/useChart.test.tsx
git commit -m "feat(chart): resizeSegments optimistic mutation over batch endpoint"
```

---

### Task 5: Wire the Beats field to debounced redistribute

**Files:**
- Modify: `frontend/src/chart/SegmentEditor.tsx`
- Modify: `frontend/src/pages/ChartEditorPage.tsx`
- Test: `frontend/src/chart/SegmentEditor.test.tsx`
- Test: `frontend/src/pages/ChartEditorPage.edit.test.tsx`

**Interfaces:**
- Consumes: `redistributeLength` (Task 1), `totalBeats` (Task 2), `resizeSegments` (Task 4).
- Produces: `SegmentEditor` props gain `allSegments: SegmentOut[]`, `maxTotalBeats: number`, `onResize: (windows: SegmentWindowInput[]) => void`, and optional `debounceMs?: number` (default 400). Changing the Beats input recomputes the layout and calls `onResize` after the debounce; root/quality keep the existing `onSave` flow.

- [ ] **Step 1: Write the failing tests**

Replace the `SegmentEditor beats` describe block's first test in `frontend/src/chart/SegmentEditor.test.tsx` and add the redistribute test. The full new top of the file:

```tsx
import { fireEvent, render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SegmentEditor from "./SegmentEditor";

const seg = {
  id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2,
  chord_root: "C", chord_quality: "maj", roman_numeral: "I",
};
const seg2 = {
  id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4,
  chord_root: "F", chord_quality: "maj", roman_numeral: "IV",
};
const baseProps = {
  segment: seg,
  allSegments: [seg, seg2],
  maxTotalBeats: 20,
  onResize: () => {},
  onSave: vi.fn().mockResolvedValue(undefined),
  onDelete: () => {},
  busy: false,
};

describe("SegmentEditor beats", () => {
  it("redistributes beats to the following chords after the debounce", () => {
    vi.useFakeTimers();
    const onResize = vi.fn();
    render(<SegmentEditor {...baseProps} onResize={onResize} debounceMs={400} />);
    const beats = screen.getByLabelText(/beats/i) as HTMLInputElement;
    fireEvent.change(beats, { target: { value: "6" } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onResize).toHaveBeenCalledWith([
      { id: "s1", start_beat: 0, end_beat: 6 },
      { id: "s2", start_beat: 6, end_beat: 8 },
    ]);
    vi.useRealTimers();
  });

  it("calls onDelete when Delete button is clicked", () => {
    const onDelete = vi.fn();
    render(<SegmentEditor {...baseProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/chart/SegmentEditor.test.tsx`
Expected: FAIL — `onResize`/`allSegments` props unknown; the Beats change does not call `onResize`.

- [ ] **Step 3: Rewrite `SegmentEditor`**

Replace `frontend/src/chart/SegmentEditor.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import type { SegmentOut, SegmentWindowInput } from "../api/types";
import type { SegmentPatch } from "./useChart";
import { ROOTS, QUALITIES, QUALITY_LABELS } from "../api/music";
import { redistributeLength } from "./chartLayout";

interface Props {
  segment: SegmentOut;
  allSegments: SegmentOut[];
  maxTotalBeats: number;
  onResize: (windows: SegmentWindowInput[]) => void;
  onSave: (patch: SegmentPatch) => Promise<void>;
  onDelete: () => void;
  busy: boolean;
  debounceMs?: number;
}

export default function SegmentEditor({
  segment,
  allSegments,
  maxTotalBeats,
  onResize,
  onSave,
  onDelete,
  busy,
  debounceMs = 400,
}: Props) {
  const [root, setRoot] = useState(segment.chord_root);
  const [quality, setQuality] = useState(segment.chord_quality);
  const [beats, setBeats] = useState(segment.end_beat - segment.start_beat);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setRoot(segment.chord_root);
    setQuality(segment.chord_quality);
    setBeats(segment.end_beat - segment.start_beat);
    setError(null);
  }, [segment.id, segment.chord_root, segment.chord_quality, segment.start_beat, segment.end_beat]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  function changeBeats(value: number) {
    setBeats(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const ordered = [...allSegments].sort((a, b) => a.start_beat - b.start_beat);
      const index = ordered.findIndex((s) => s.id === segment.id);
      if (index < 0) return;
      const windows = redistributeLength(ordered, index, value, maxTotalBeats);
      onResize(
        windows.map((w, i) => ({
          id: ordered[i].id,
          start_beat: w.start_beat,
          end_beat: w.end_beat,
        })),
      );
    }, debounceMs);
  }

  async function saveChord() {
    setError(null);
    try {
      await onSave({ chord_root: root, chord_quality: quality });
    } catch (err) {
      const detail = (err as { detail?: string }).detail;
      setError(detail ?? "Could not save segment");
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <strong>Edit segment</strong>
      <label>
        Root
        <select value={root} onChange={(e) => setRoot(e.target.value)}>
          {ROOTS.map((r) => (<option key={r} value={r}>{r}</option>))}
        </select>
      </label>
      <label>
        Quality
        <select value={quality} onChange={(e) => setQuality(e.target.value)}>
          {QUALITIES.map((q) => (<option key={q} value={q}>{QUALITY_LABELS[q]}</option>))}
        </select>
      </label>
      <label>
        Beats
        <input
          type="number"
          step="0.5"
          min="0.5"
          value={beats}
          onChange={(e) => changeBeats(Number(e.target.value))}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" onClick={saveChord} disabled={busy}>Save</button>
        <button className="danger" onClick={onDelete} disabled={busy}>Delete</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `ChartEditorPage`**

In `frontend/src/pages/ChartEditorPage.tsx`:

Add the import near the other chart imports:

```tsx
import { totalBeats } from "../chart/beatGrid";
```

Pull `resizeSegments` out of `useChart` (add it to the destructure around line 24-33):

```tsx
    resizeSegments,
```

Replace the `SegmentEditor` usage block (lines 132-142) with:

```tsx
            {selectedId && chart.segments.find((s) => s.id === selectedId) && (
              <SegmentEditor
                segment={chart.segments.find((s) => s.id === selectedId)!}
                allSegments={chart.segments}
                maxTotalBeats={totalBeats(chart.beat_times, analysis?.bpm ?? null, duration)}
                onResize={(windows) => resizeSegments(windows)}
                onSave={(patch) => updateSegment(selectedId, patch).then(() => undefined)}
                onDelete={() => {
                  deleteSegment(selectedId);
                  setSelectedId(null);
                }}
                busy={isMutating}
              />
            )}
```

- [ ] **Step 5: Update the page integration test**

In `frontend/src/pages/ChartEditorPage.edit.test.tsx`, the `CHART` fixture segments need beat fields and the analysis already supplies bpm. Replace the `CHART` constant with:

```tsx
const CHART = {
  id: "c1", recording_id: "r1", key_tonic: "C", key_mode: "major",
  beats_per_measure: 4, measure_offset: 0, beat_times: [],
  segments: [
    { id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
    { id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4, chord_root: "F", chord_quality: "maj", roman_numeral: "IV" },
  ],
};
```

Add a test verifying the Beats edit hits the batch endpoint (append in the file):

```tsx
test("editing beats redistributes via the batch endpoint", async () => {
  login();
  let body: unknown = null;
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json({ ...RECORDING, duration_seconds: 10 })),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.patch("/api/charts/c1/segments", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(CHART);
    }),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  await userEvent.click(await screen.findByText("I")); // select C on the timeline
  const beats = await screen.findByLabelText(/beats/i);
  fireEvent.change(beats, { target: { value: "6" } });
  await waitFor(() => expect(body).toEqual({ segments: [
    { id: "s1", start_beat: 0, end_beat: 6 },
    { id: "s2", start_beat: 6, end_beat: 8 },
  ] }));
});
```

Ensure the imports at the top of the file include `fireEvent` and `waitFor`:

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
```

(Other existing tests that select a segment and click Save still pass: Save now persists only root/quality, which those tests assert via `chord_quality`.)

- [ ] **Step 6: Run the frontend tests + type-check**

Run: `cd frontend && npx vitest run src/chart/SegmentEditor.test.tsx src/pages/ChartEditorPage.edit.test.tsx && npm run build`
Expected: PASS and a clean `tsc -b`.

- [ ] **Step 7: Run the whole frontend suite**

Run: `cd frontend && npm test`
Expected: PASS (no regressions in Timeline/useChart/ChartEditorPage tests).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/chart/SegmentEditor.tsx frontend/src/pages/ChartEditorPage.tsx \
        frontend/src/chart/SegmentEditor.test.tsx frontend/src/pages/ChartEditorPage.edit.test.tsx
git commit -m "feat(chart-editor): beats field redistributes neighbours with live preview"
```

---

### Task 6: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Backend suite**

Run: `.venv/bin/pytest`
Expected: PASS (all tests, including the new batch-resize cases).

- [ ] **Step 2: Frontend suite + build**

Run: `cd frontend && npm test && npm run build`
Expected: PASS + clean type-check.

- [ ] **Step 3: Manual sanity (optional, documented)**

With backend + frontend running, open a chart, select an interior chord, raise its Beats — the following chord shrinks in real time, the save lands, and no "segment overlaps an existing segment" error appears.

---

## Self-Review

**Spec coverage:**
- Redistribute-total-fixed rule → Task 1 (`redistributeLength`).
- Grid cap honored → Task 1 (last-chord clamp via `maxTotalBeats` from Task 2) + Task 3 (server-side grid check).
- No-overlap / atomic persistence → Task 3 (batch endpoint validates final state in one transaction).
- Real-time preview → Task 4 (optimistic cache update) + Task 5 (debounced auto-commit).
- Schema + type updated together → Task 3 + Task 4.
- Failing-first tests at pure / backend / integration levels → Tasks 1, 3, 5.

**Placeholder scan:** No TBD/TODO; every code step contains complete code.

**Type consistency:** `SegmentWindow`/`SegmentBatchUpdate` (backend) ↔ `SegmentWindowInput` + `{ segments: [...] }` body (frontend) match. `redistributeLength` signature is identical across Tasks 1, 5. `resizeSegments(windows)` identical across Tasks 4, 5. `totalBeats(beatTimes, bpm, duration)` identical across Tasks 2, 5.

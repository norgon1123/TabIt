# Library Search/Sort + Chart Re-analyze with Loading State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side search and date-sort to the recordings library, a re-analyze button on the chart page, and a loading spinner that appears (on both pages) while an analysis job runs, with the chart refreshing in place when it finishes.

**Architecture:** Search/sort is a pure helper applied to the already-fetched list in `LibraryPage`. Re-analyze reuses the existing `POST /api/recordings/{id}/analyze` endpoint via a new mutation hook; the chart page polls the recording and chart queries while analysis is in progress so React Query swaps in the fresh chart automatically. A shared `<Spinner>` is reused by the chart page and the library's status badge.

**Tech Stack:** React + TypeScript, @tanstack/react-query, react-router-dom, Vitest + Testing Library + msw. No backend changes.

## Global Constraints

- No backend changes — the `/analyze` endpoint already exists and is reused as-is.
- Search/sort are client-side only (operate on the in-memory list).
- Test runner: from `frontend/`, run a single file with `npx vitest run <path>`; full suite with `npm test`.
- Typecheck/build: from `frontend/`, `npm run build` (`tsc -b && vite build`).
- Frontend tests use `renderWithProviders` from `src/test/utils.tsx` and msw handlers via `server.use(...)` from `src/test/server`. Vitest globals (`test`, `expect`) are available without import.
- Match existing code style: inline `style={{}}` objects, `className` tokens like `muted`/`card`/`primary`/`danger`, no new CSS files except a spinner keyframe.

---

### Task 1: `filterAndSortRecordings` pure helper

**Files:**
- Create: `frontend/src/library/filterSort.ts`
- Test: `frontend/src/library/filterSort.test.ts`

**Interfaces:**
- Consumes: `RecordingOut` from `../api/types`.
- Produces:
  - `export type SortDir = "newest" | "oldest";`
  - `export function filterAndSortRecordings(recordings: RecordingOut[], query: string, sortDir: SortDir): RecordingOut[]`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/library/filterSort.test.ts
import { filterAndSortRecordings } from "./filterSort";
import type { RecordingOut } from "../api/types";

function rec(id: string, name: string, createdAt: string): RecordingOut {
  return {
    id,
    original_filename: name,
    format: "m4a",
    duration_seconds: 1,
    status: "uploaded",
    created_at: createdAt,
    analysis: null,
  };
}

const A = rec("a", "Blue in Green.m4a", "2026-06-01T00:00:00Z");
const B = rec("b", "Autumn Leaves.m4a", "2026-06-03T00:00:00Z");
const C = rec("c", "blue MONK.m4a", "2026-06-02T00:00:00Z");
const all = [A, B, C];

test("empty query returns all, sorted newest first", () => {
  expect(filterAndSortRecordings(all, "", "newest").map((r) => r.id)).toEqual(["b", "c", "a"]);
});

test("whitespace-only query matches all", () => {
  expect(filterAndSortRecordings(all, "   ", "newest")).toHaveLength(3);
});

test("filter is case-insensitive substring on filename", () => {
  expect(filterAndSortRecordings(all, "blue", "newest").map((r) => r.id)).toEqual(["c", "a"]);
});

test("oldest sort is ascending by created_at", () => {
  expect(filterAndSortRecordings(all, "", "oldest").map((r) => r.id)).toEqual(["a", "c", "b"]);
});

test("no match returns empty array", () => {
  expect(filterAndSortRecordings(all, "zzz", "newest")).toEqual([]);
});

test("does not mutate the input array", () => {
  const input = [...all];
  filterAndSortRecordings(input, "", "oldest");
  expect(input.map((r) => r.id)).toEqual(["a", "b", "c"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/library/filterSort.test.ts`
Expected: FAIL — cannot resolve `./filterSort` / `filterAndSortRecordings is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/library/filterSort.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/library/filterSort.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/library/filterSort.ts frontend/src/library/filterSort.test.ts
git commit -m "feat(library): add filterAndSortRecordings helper"
```

---

### Task 2: Library search + sort controls

**Files:**
- Modify: `frontend/src/pages/LibraryPage.tsx`
- Modify: `frontend/src/pages/LibraryPage.test.tsx`

**Interfaces:**
- Consumes: `filterAndSortRecordings`, `SortDir` from `../library/filterSort`.
- Produces: no exported API change; adds UI (`placeholder="Search recordings"` input and a sort toggle button labelled `Newest first` / `Oldest first`).

- [ ] **Step 1: Write the failing tests**

Add these tests to `frontend/src/pages/LibraryPage.test.tsx` (keep the existing two). Add `userEvent` import at the top.

```ts
import userEvent from "@testing-library/user-event";

const TWO = [
  { id: "r1", original_filename: "Autumn Leaves.m4a", format: "m4a", duration_seconds: 30, status: "uploaded",
    created_at: "2026-06-01T00:00:00Z",
    analysis: { status: "done", bpm: 96, detected_key_tonic: "G", detected_key_mode: "major", engine_version: "v1", error: null } },
  { id: "r2", original_filename: "Blue in Green.m4a", format: "m4a", duration_seconds: 30, status: "uploaded",
    created_at: "2026-06-03T00:00:00Z",
    analysis: { status: "done", bpm: 80, detected_key_tonic: "C", detected_key_mode: "major", engine_version: "v1", error: null } },
];

test("search narrows the visible recordings", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json(TWO)));
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText("Autumn Leaves.m4a")).toBeInTheDocument();

  await userEvent.type(screen.getByPlaceholderText(/search recordings/i), "blue");
  expect(screen.getByText("Blue in Green.m4a")).toBeInTheDocument();
  expect(screen.queryByText("Autumn Leaves.m4a")).not.toBeInTheDocument();
});

test("shows a no-match message when search excludes everything", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json(TWO)));
  renderWithProviders(<LibraryPage />);
  await screen.findByText("Autumn Leaves.m4a");
  await userEvent.type(screen.getByPlaceholderText(/search recordings/i), "zzz");
  expect(screen.getByText(/no recordings match/i)).toBeInTheDocument();
});

test("toggling sort reverses recording order", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json(TWO)));
  renderWithProviders(<LibraryPage />);
  // default newest-first: Blue (06-03) before Autumn (06-01)
  const namesBefore = screen.getAllByText(/\.m4a$/).map((n) => n.textContent);
  expect(await screen.findByText("Blue in Green.m4a")).toBeInTheDocument();
  expect(namesBefore[0]).toBe("Blue in Green.m4a");

  await userEvent.click(screen.getByRole("button", { name: /newest first/i }));
  const namesAfter = screen.getAllByText(/\.m4a$/).map((n) => n.textContent);
  expect(namesAfter[0]).toBe("Autumn Leaves.m4a");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/LibraryPage.test.tsx`
Expected: FAIL — no `Search recordings` input / no `Newest first` button.

- [ ] **Step 3: Implement the controls in `LibraryPage.tsx`**

In the component, add state and derive the visible list. Replace the existing `export default function LibraryPage()` body's top and the list rendering:

```tsx
// add imports
import { filterAndSortRecordings, type SortDir } from "../library/filterSort";

// inside LibraryPage(), after the useRecordings() destructure:
const [query, setQuery] = useState("");
const [sortDir, setSortDir] = useState<SortDir>("newest");
const visible = filterAndSortRecordings(recordings, query, sortDir);
```

Add the controls below the header `<div>` (before the loading/empty messages):

```tsx
<div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
  <input
    type="search"
    placeholder="Search recordings"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    style={{ flex: "1 1 200px" }}
  />
  <button onClick={() => setSortDir((d) => (d === "newest" ? "oldest" : "newest"))}>
    {sortDir === "newest" ? "Newest first" : "Oldest first"}
  </button>
</div>
```

Change the list to map over `visible` instead of `recordings`, and add a no-match message. Replace the empty-state line and `<ul>` open:

```tsx
{!isLoading && recordings.length === 0 && (
  <p className="muted">No recordings yet. Upload one to start.</p>
)}
{!isLoading && recordings.length > 0 && visible.length === 0 && (
  <p className="muted">No recordings match your search.</p>
)}

<ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
  {visible.map((r) => (
```

(The `<li>` body is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/LibraryPage.test.tsx`
Expected: PASS (all 5 tests, including the original two).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LibraryPage.tsx frontend/src/pages/LibraryPage.test.tsx
git commit -m "feat(library): add name search and upload-date sort"
```

---

### Task 3: Shared `Spinner` component

**Files:**
- Create: `frontend/src/components/Spinner.tsx`
- Create: `frontend/src/components/Spinner.test.tsx`

**Interfaces:**
- Produces: `export default function Spinner(props: { size?: number; label?: string }): JSX.Element` — renders an element with `role="status"` and an accessible label (default `"Loading"`).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/Spinner.test.tsx
import { render, screen } from "@testing-library/react";
import Spinner from "./Spinner";

test("renders an accessible status role with default label", () => {
  render(<Spinner />);
  expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
});

test("uses a custom label when provided", () => {
  render(<Spinner label="Analyzing" />);
  expect(screen.getByRole("status", { name: /analyzing/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/Spinner.test.tsx`
Expected: FAIL — cannot resolve `./Spinner`.

- [ ] **Step 3: Write the component**

```tsx
// frontend/src/components/Spinner.tsx
export default function Spinner({ size = 16, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "2px solid var(--muted)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "tabit-spin 0.8s linear infinite",
        verticalAlign: "middle",
      }}
    />
  );
}
```

Add the keyframe once to `frontend/src/index.css` (append at end of file):

```css
@keyframes tabit-spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/Spinner.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Spinner.tsx frontend/src/components/Spinner.test.tsx frontend/src/index.css
git commit -m "feat(components): add shared Spinner with spin keyframe"
```

---

### Task 4: Spinner in `AnalysisStatusBadge` (library reuse)

**Files:**
- Modify: `frontend/src/components/AnalysisStatusBadge.tsx`
- Create: `frontend/src/components/AnalysisStatusBadge.test.tsx`

**Interfaces:**
- Consumes: `Spinner` from `./Spinner`.
- Produces: no API change; badge shows a `<Spinner>` inline when `status` is `pending` or `running`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/AnalysisStatusBadge.test.tsx
import { render, screen } from "@testing-library/react";
import AnalysisStatusBadge from "./AnalysisStatusBadge";

const base = { bpm: null, detected_key_tonic: null, detected_key_mode: null, engine_version: null, error: null };

test("shows a spinner while running", () => {
  render(<AnalysisStatusBadge analysis={{ ...base, status: "running" }} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
});

test("no spinner when done", () => {
  render(<AnalysisStatusBadge analysis={{ ...base, status: "done" }} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/AnalysisStatusBadge.test.tsx`
Expected: FAIL — no element with `role="status"` when running.

- [ ] **Step 3: Implement**

Edit `AnalysisStatusBadge.tsx`. Add the import and render the spinner for in-progress states:

```tsx
import type { AnalysisOut } from "../api/types";
import Spinner from "./Spinner";

const COLORS: Record<string, string> = {
  pending: "var(--muted)",
  running: "var(--accent)",
  done: "var(--ok)",
  failed: "var(--danger)",
};

export default function AnalysisStatusBadge({ analysis }: { analysis: AnalysisOut | null }) {
  const status = analysis?.status ?? "pending";
  const inProgress = status === "pending" || status === "running";
  return (
    <span style={{ color: COLORS[status] ?? "var(--muted)", fontWeight: 600 }}>
      {inProgress && (
        <>
          <Spinner size={12} label={status} />{" "}
        </>
      )}
      {status}
      {analysis?.status === "done" && analysis.bpm != null && (
        <span className="muted" style={{ fontWeight: 400 }}>
          {" "}· {Math.round(analysis.bpm)} BPM · {analysis.detected_key_tonic} {analysis.detected_key_mode}
        </span>
      )}
      {analysis?.status === "failed" && analysis.error && (
        <span className="muted" style={{ fontWeight: 400 }}> · {analysis.error}</span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/AnalysisStatusBadge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AnalysisStatusBadge.tsx frontend/src/components/AnalysisStatusBadge.test.tsx
git commit -m "feat(library): show spinner in status badge while analyzing"
```

---

### Task 5: `useReanalyze` hook

**Files:**
- Create: `frontend/src/chart/useReanalyze.ts`
- Create: `frontend/src/chart/useReanalyze.test.tsx`

**Interfaces:**
- Consumes: `api` from `../api/client`; `useMutation`, `useQueryClient` from `@tanstack/react-query`.
- Produces: `export function useReanalyze(recordingId: string): { reanalyze: () => Promise<unknown>; isPending: boolean }`. On success it invalidates `["recording", recordingId]`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/chart/useReanalyze.test.tsx
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { useReanalyze } from "./useReanalyze";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test("posts to the analyze endpoint", async () => {
  let hit = false;
  server.use(
    http.post("/api/recordings/r1/analyze", () => {
      hit = true;
      return HttpResponse.json({ status: "pending", bpm: null, detected_key_tonic: null, detected_key_mode: null, engine_version: null, error: null }, { status: 202 });
    }),
  );
  const { result } = renderHook(() => useReanalyze("r1"), { wrapper });
  await act(async () => {
    await result.current.reanalyze();
  });
  await waitFor(() => expect(hit).toBe(true));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/chart/useReanalyze.test.tsx`
Expected: FAIL — cannot resolve `./useReanalyze`.

- [ ] **Step 3: Implement the hook**

```ts
// frontend/src/chart/useReanalyze.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useReanalyze(recordingId: string) {
  const queryClient = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.post(`/api/recordings/${recordingId}/analyze`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recording", recordingId] }),
  });
  return { reanalyze: () => mut.mutateAsync(), isPending: mut.isPending };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/chart/useReanalyze.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart/useReanalyze.ts frontend/src/chart/useReanalyze.test.tsx
git commit -m "feat(chart): add useReanalyze hook"
```

---

### Task 6: `useChart` polling option

**Files:**
- Modify: `frontend/src/chart/useChart.ts:22-26`
- Modify: `frontend/src/chart/useChart.test.tsx`

**Interfaces:**
- Produces: `useChart(recordingId: string, options?: { poll?: boolean })` — when `options.poll` is true, the chart query uses `refetchInterval: 2000`, otherwise `false`. All existing return fields unchanged.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/chart/useChart.test.tsx` a test that the hook accepts the options arg and still returns a chart. Mirror the existing setup in that file (reuse its wrapper/handlers). Minimal addition:

```tsx
test("accepts a poll option without breaking the chart fetch", async () => {
  server.use(
    http.get("/api/recordings/r1/chart", () =>
      HttpResponse.json({ id: "c1", recording_id: "r1", key_tonic: "C", key_mode: "major", segments: [] }),
    ),
  );
  const { result } = renderHook(() => useChart("r1", { poll: true }), { wrapper });
  await waitFor(() => expect(result.current.chart?.id).toBe("c1"));
});
```

> If `useChart.test.tsx` does not already define `wrapper`/`renderHook`/`waitFor` imports, add them following the pattern in `useReanalyze.test.tsx` (Task 5).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/chart/useChart.test.tsx`
Expected: FAIL — `useChart` ignores/rejects the second argument (TS error or the new test not compiling).

- [ ] **Step 3: Implement the option**

Change the signature and the `useQuery` call in `useChart.ts`:

```ts
export function useChart(recordingId: string, options: { poll?: boolean } = {}) {
  const queryClient = useQueryClient();
  const key = ["chart", recordingId];

  const chartQuery = useQuery({
    queryKey: key,
    queryFn: () => fetchChart(recordingId),
    refetchInterval: options.poll ? 2000 : false,
  });
```

(Everything below this line in the hook is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/chart/useChart.test.tsx`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/chart/useChart.ts frontend/src/chart/useChart.test.tsx
git commit -m "feat(chart): add optional polling to useChart"
```

---

### Task 7: Chart page re-analyze button, polling, and spinner

**Files:**
- Modify: `frontend/src/pages/ChartEditorPage.tsx`
- Modify: `frontend/src/pages/ChartEditorPage.test.tsx`

**Interfaces:**
- Consumes: `useReanalyze` (Task 5), `useChart(..., { poll })` (Task 6), `Spinner` (Task 3).
- Produces: a `Re-analyze` button; recording query and chart query poll every 2s while `analysis.status` is `pending`/`running`; a `<Spinner>` with an "Analyzing" label shows while in progress.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/pages/ChartEditorPage.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event";

test("re-analyze button posts to the analyze endpoint", async () => {
  login();
  let hit = false;
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.post("/api/recordings/r1/analyze", () => {
      hit = true;
      return HttpResponse.json({ status: "pending", bpm: null, detected_key_tonic: null, detected_key_mode: null, engine_version: null, error: null }, { status: 202 });
    }),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  await screen.findByText(/120 BPM/i);
  await userEvent.click(screen.getByRole("button", { name: /re-analyze/i }));
  await screen.findByRole("status"); // spinner appears (button disabled while pending)
  expect(hit).toBe(true);
});

test("shows a spinner while analysis is running", async () => {
  login();
  server.use(
    http.get("/api/recordings/r1", () =>
      HttpResponse.json({ ...RECORDING, analysis: { ...RECORDING.analysis, status: "running" } }),
    ),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json({ detail: "Chart not found" }, { status: 404 })),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  expect(await screen.findByRole("status")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/ChartEditorPage.test.tsx`
Expected: FAIL — no `Re-analyze` button / no `role="status"` while running.

- [ ] **Step 3: Implement in `ChartEditorPage.tsx`**

Add imports:

```tsx
import Spinner from "../components/Spinner";
import { useReanalyze } from "../chart/useReanalyze";
```

Derive `inProgress`, wire polling, and the hook. Replace the recording query and `useChart` call:

```tsx
const recordingQuery = useQuery({
  queryKey: ["recording", id],
  queryFn: () => api.get<RecordingOut>(`/api/recordings/${id}`),
  refetchInterval: (query) => {
    const s = query.state.data?.analysis?.status;
    return s === "pending" || s === "running" ? 2000 : false;
  },
});

const recording = recordingQuery.data;
const analysis = recording?.analysis ?? null;
const inProgress = analysis?.status === "pending" || analysis?.status === "running";

const {
  chart,
  isLoading: chartLoading,
  isMutating,
  addSegment,
  updateSegment,
  deleteSegment,
  transpose,
} = useChart(id, { poll: inProgress });

const { reanalyze, isPending: reanalyzing } = useReanalyze(id);
```

> Note: `recording`, `analysis`, and `duration` are currently declared lower in the file (around line 33). Move the `recording`/`analysis` declarations up to where `inProgress` needs them (as shown above) and delete the now-duplicate later declarations. Keep `const duration = recording?.duration_seconds ?? 0;`.

Add the button + spinner in the header, replacing the `<h1>` line:

```tsx
<div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
  <h1 style={{ margin: 0 }}>{recording?.original_filename ?? "Chart"}</h1>
  <button onClick={() => reanalyze()} disabled={reanalyzing || inProgress}>
    Re-analyze
  </button>
  {inProgress && (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} className="muted">
      <Spinner label="Analyzing" /> Analyzing…
    </span>
  )}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/ChartEditorPage.test.tsx`
Expected: PASS (existing 2 + new 2).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ChartEditorPage.tsx frontend/src/pages/ChartEditorPage.test.tsx
git commit -m "feat(chart): add re-analyze button with polling and loading spinner"
```

---

### Task 8: Full verification

- [ ] **Step 1: Typecheck + build**

Run: `cd frontend && npm run build`
Expected: no TypeScript errors; build succeeds.

- [ ] **Step 2: Full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass.

- [ ] **Step 3: Backend test suite (sanity — no backend changes)**

Run: `.venv/bin/python -m pytest -q`
Expected: passes as before (use `.venv`; there is no `python` on PATH per project setup).

- [ ] **Step 4: Commit any incidental fixes**

```bash
git add -A
git commit -m "test: verify library search/sort + chart re-analyze suite green" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** search (Task 2) ✓, sort asc/desc by upload date (Tasks 1–2) ✓, re-analyze button on chart page (Tasks 5,7) ✓, loading icon while job runs on chart page (Task 7) and reused on Library (Tasks 3,4) ✓, in-place chart refresh without reload via polling (Tasks 6,7) ✓.
- **Type consistency:** `SortDir`, `filterAndSortRecordings`, `useReanalyze` signature, and `useChart(id, { poll })` are used identically across tasks.
- **No backend changes:** `/analyze` endpoint reused as-is; Task 8 runs the backend suite only as a sanity check.

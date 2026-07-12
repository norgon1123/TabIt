# Library Search/Sort + Chart Re-analyze with Loading State

Date: 2026-06-30

## Goal

1. Let users search their recordings library by name.
2. Let users sort recordings ascending/descending by upload date.
3. Add a re-analyze button to the chart page.
4. Show a loading icon while an analysis job is running, so the user knows the
   process is still active.

## Decisions (from brainstorming)

- Search and sort are **client-side** (the full recordings list is already
  fetched). No backend changes.
- After clicking re-analyze on the chart page, the page **polls** and the new
  chart appears **in place** — no manual or automatic page reload.
- The loading spinner appears on the **chart page** and is **reused on the
  Library** list for in-progress analyses.

## Current state (relevant)

- `GET /api/recordings` already returns the list ordered by `created_at desc`.
- `POST /api/recordings/{id}/analyze` already exists and re-runs analysis
  (deletes the old immutable `Analysis`, creates a fresh `pending` one,
  dispatches the job). The Library page already has a Re-analyze button wired to
  `useRecordings().reanalyze`.
- `ChartEditorPage` fetches the recording via its own `useQuery(["recording",
  id])` (no polling) and the chart via `useChart(id)` (no polling). It has no
  re-analyze button.
- `AnalysisOut.status` is one of `pending | running | done | failed`.

## Feature 1 + 2 — Library search & sort (client-side)

New pure helper `frontend/src/library/filterSort.ts`:

```ts
export type SortDir = "newest" | "oldest";

export function filterAndSortRecordings(
  recordings: RecordingOut[],
  query: string,
  sortDir: SortDir,
): RecordingOut[];
```

- Filter: case-insensitive substring match of trimmed `query` against
  `original_filename`. Empty/whitespace query matches all.
- Sort: by `created_at` (ISO string compare is chronologically correct).
  `newest` = descending, `oldest` = ascending. Non-mutating (copies the array).

`LibraryPage` holds `query: string` and `sortDir: SortDir` (default `"newest"`)
in `useState`, renders a search `<input>` and a sort toggle button above the
list, and maps over `filterAndSortRecordings(recordings, query, sortDir)`. When
the filtered result is empty but recordings exist, show a "No recordings match"
message distinct from the existing empty-library message.

## Feature 3 — Re-analyze on the chart page

New hook `frontend/src/chart/useReanalyze.ts`:

- `useMutation` that POSTs `/api/recordings/{id}/analyze`.
- `onSuccess`: invalidate `["recording", id]` so the recording (and its
  `analysis.status`) refetches and flips to `pending`, which triggers polling
  (Feature 4).
- Exposes `reanalyze()` and `isPending`.

`ChartEditorPage` renders a "Re-analyze" button in the header area, disabled
while the mutation is pending or while analysis is already in progress.

## Feature 4 — Loading icon + in-place refresh

New `frontend/src/components/Spinner.tsx`: a small accessible spinner
(`role="status"`, `aria-label`) using a CSS keyframe rotation. Size prop with a
sensible default.

Chart page in-place refresh:

- Derive `inProgress = analysis?.status === "pending" || analysis?.status ===
  "running"`.
- Recording query gets `refetchInterval: inProgress ? 2000 : false`.
- `useChart` gains an options arg `{ poll?: boolean }` that sets
  `refetchInterval: poll ? 2000 : false`. `ChartEditorPage` passes
  `poll: inProgress`.
- Flow: re-analyze → recording refetches → `status: pending` → both queries
  poll → job finishes → recording `status: done` (polling stops) and the chart
  query returns the freshly-built chart, which React Query swaps into the view
  automatically. No reload.
- While `inProgress`, render `<Spinner />` next to the status line / button with
  an "Analyzing…" label.

Library reuse: `AnalysisStatusBadge` renders `<Spinner />` inline when status is
`pending` or `running`. The Library list already polls via `useRecordings`.

## Testing

- `filterSort.test.ts`: filter (case-insensitive, trim, empty, no-match) and
  sort (newest/oldest, non-mutation, stable on equal timestamps).
- `LibraryPage.test.tsx`: typing in search narrows the list; toggling sort
  reorders; no-match message appears.
- `ChartEditorPage` test: re-analyze button calls the endpoint; spinner shows
  while `analysis.status` is `running` and the chart appears once `done`
  (driven by mocked query data) without a reload.
- `Spinner.test.tsx`: renders with `role="status"`.
- Run the existing backend test suite unchanged (no backend changes expected).

## Out of scope

- Server-side search/sort and pagination.
- Changing the analysis pipeline or `/analyze` semantics.
- Debounced search (list is small and in-memory).

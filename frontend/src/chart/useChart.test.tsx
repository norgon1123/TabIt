import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../test/server";
import { useChart } from "./useChart";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const CHART = {
  id: "c1", recording_id: "r1", key_tonic: "C", key_mode: "major",
  segments: [
    { id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
  ],
};

test("loads the chart", async () => {
  server.use(http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)));
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.chart).not.toBeNull());
  expect(result.current.chart!.segments[0].roman_numeral).toBe("I");
});

test("missing chart (404) resolves to null", async () => {
  server.use(
    http.get("/api/recordings/r1/chart", () => HttpResponse.json({ detail: "Chart not found" }, { status: 404 })),
  );
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.chart).toBeNull();
});

test("transpose posts semitones to the chart", async () => {
  let body: unknown = null;
  server.use(
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.post("/api/charts/c1/transpose", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ...CHART, key_tonic: "D" });
    }),
  );
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.chart).not.toBeNull());
  await result.current.transpose(2);
  expect(body).toEqual({ semitones: 2 });
});

test("updateSegment patches the right segment", async () => {
  let body: unknown = null;
  server.use(
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.patch("/api/charts/c1/segments/s1", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ...CHART.segments[0], chord_quality: "min", roman_numeral: "i" });
    }),
  );
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.chart).not.toBeNull());
  await result.current.updateSegment("s1", { chord_quality: "min" });
  expect(body).toEqual({ chord_quality: "min" });
});

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
      // Simulate realistic network latency: without it, the optimistic
      // onMutate update and the onSettled-triggered refetch both resolve
      // within the same microtask flush, so there's no window for RTL's
      // waitFor polling to observe the optimistic state before onSettled's
      // invalidate/refetch overwrites it with the (identical) server response.
      await new Promise((r) => setTimeout(r, 150));
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

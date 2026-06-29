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

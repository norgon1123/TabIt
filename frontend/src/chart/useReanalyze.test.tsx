import type { ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { useReanalyze } from "./useReanalyze";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test("posts to the analyze endpoint", async () => {
  let hit = false;
  server.use(
    http.post("/api/recordings/r1/analyze", () => {
      hit = true;
      return HttpResponse.json(
        { status: "pending", bpm: null, detected_key_tonic: null, detected_key_mode: null, engine_version: null, error: null },
        { status: 202 },
      );
    }),
  );
  const { result } = renderHook(() => useReanalyze("r1"), { wrapper });
  await act(async () => {
    await result.current.reanalyze();
  });
  await waitFor(() => expect(hit).toBe(true));
});

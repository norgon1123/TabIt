import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { server } from "../test/server";
import { useRecordings } from "./useRecordings";

vi.mock("./audioDuration", () => ({
  readAudioDuration: () => Promise.resolve(null),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test("loads the recordings list", async () => {
  server.use(
    http.get("/api/recordings", () =>
      HttpResponse.json([
        { id: "r1", original_filename: "a.m4a", format: "m4a", duration_seconds: 12, status: "uploaded",
          analysis: { status: "done", bpm: 120, detected_key_tonic: "C", detected_key_mode: "major", engine_version: "template-v1", error: null } },
      ]),
    ),
  );
  const { result } = renderHook(() => useRecordings(), { wrapper });
  await waitFor(() => expect(result.current.recordings).toHaveLength(1));
  expect(result.current.recordings[0].original_filename).toBe("a.m4a");
});

test("upload posts multipart form with the file", async () => {
  let received: FormData | null = null;
  server.use(
    http.get("/api/recordings", () => HttpResponse.json([])),
    http.post("/api/recordings", async ({ request }) => {
      received = await request.formData();
      return HttpResponse.json(
        { id: "r9", original_filename: "new.m4a", format: "m4a", duration_seconds: 5, status: "uploaded", analysis: { status: "pending", bpm: null, detected_key_tonic: null, detected_key_mode: null, engine_version: null, error: null } },
        { status: 201 },
      );
    }),
  );
  const { result } = renderHook(() => useRecordings(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  const file = new File([new Uint8Array([1, 2, 3])], "new.m4a", { type: "audio/mp4" });
  await result.current.upload(file);
  expect(received).not.toBeNull();
  expect((received!.get("file") as File).name).toBe("new.m4a");
});

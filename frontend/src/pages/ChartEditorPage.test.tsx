import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import ChartEditorPage from "./ChartEditorPage";

function login() {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
}

const RECORDING = {
  id: "r1", original_filename: "song.m4a", format: "m4a", duration_seconds: 4, status: "uploaded",
  analysis: { status: "done", bpm: 120, detected_key_tonic: "C", detected_key_mode: "major", engine_version: "template-v1", error: null },
};
const CHART = {
  id: "c1", recording_id: "r1", key_tonic: "C", key_mode: "major",
  segments: [
    { id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
    { id: "s2", start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
  ],
};

test("shows BPM, key, and the chord timeline", async () => {
  login();
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  expect(await screen.findByText(/120 BPM/i)).toBeInTheDocument();
  expect(screen.getByText(/key: C major/i)).toBeInTheDocument();
  expect(screen.getByText("I")).toBeInTheDocument();
  expect(screen.getByText("V")).toBeInTheDocument();
});

test("shows analyzing state when the chart is not ready", async () => {
  login();
  server.use(
    http.get("/api/recordings/r1", () =>
      HttpResponse.json({ ...RECORDING, analysis: { ...RECORDING.analysis, status: "running" } }),
    ),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json({ detail: "Chart not found" }, { status: 404 })),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  expect(await screen.findByText(/analyzing/i)).toBeInTheDocument();
});

// The audio player is rendered with the chart, so a page opened while analysis is still
// running has no player at all. A slow engine (demucs -> btc) is always still running when
// you land here, so without polling the player never appears until a manual reload.
test("player appears on its own once analysis finishes", async () => {
  login();
  let done = false;
  server.use(
    http.get("/api/recordings/r1", () =>
      HttpResponse.json({
        ...RECORDING,
        analysis: { ...RECORDING.analysis, status: done ? "done" : "running" },
      }),
    ),
    http.get("/api/recordings/r1/chart", () =>
      done
        ? HttpResponse.json(CHART)
        : HttpResponse.json({ detail: "Chart not found" }, { status: 404 }),
    ),
  );
  const { container } = renderWithProviders(<ChartEditorPage />, {
    route: "/recordings/r1",
    path: "/recordings/:recordingId",
  });

  expect(await screen.findByText(/analyzing/i)).toBeInTheDocument();
  expect(container.querySelector("audio")).toBeNull();

  done = true; // the analysis job finishes server-side; nothing reloads the page

  await waitFor(() => expect(container.querySelector("audio")).not.toBeNull(), { timeout: 5000 });
  const player = container.querySelector("audio")!;
  expect(player).toHaveAttribute("controls");
  expect(player).toHaveAttribute("src", "/api/recordings/r1/audio");
});

import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  beats_per_measure: 4, measure_offset: 0, beat_times: [],
  segments: [
    { id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
    { id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4, chord_root: "F", chord_quality: "maj", roman_numeral: "IV" },
  ],
};

test("selecting a segment and saving sends a PATCH", async () => {
  login();
  let patched: unknown = null;
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.patch("/api/charts/c1/segments/s1", async ({ request }) => {
      patched = await request.json();
      return HttpResponse.json({ ...CHART.segments[0], chord_quality: "min", roman_numeral: "i" });
    }),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  await userEvent.click(await screen.findByText("I")); // select segment on the timeline
  await userEvent.selectOptions(await screen.findByLabelText(/quality/i), "min");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(patched).toMatchObject({ chord_quality: "min" });
});

test("transpose +1 posts to the chart", async () => {
  login();
  let body: unknown = null;
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.post("/api/charts/c1/transpose", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ...CHART, key_tonic: "C#" });
    }),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  await screen.findByText("I");
  await userEvent.click(screen.getByRole("button", { name: /\+1/ }));
  expect(body).toEqual({ semitones: 1 });
});

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

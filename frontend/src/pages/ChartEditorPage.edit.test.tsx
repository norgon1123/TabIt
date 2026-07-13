import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import ChartEditorPage from "./ChartEditorPage";

// Editing the chart is one of the two ways to open a song, so these open at `?mode=edit`.
// A song opened with no mode lands on the chooser instead — that path, and practice mode
// itself, are covered in ChartEditorPage.practice.test.tsx.

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
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1?mode=edit", path: "/recordings/:recordingId" });
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
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1?mode=edit", path: "/recordings/:recordingId" });
  await screen.findByText("I");
  await userEvent.click(screen.getByRole("button", { name: /advanced options/i }));
  await userEvent.click(screen.getByRole("button", { name: /\+1/ }));
  expect(body).toEqual({ semitones: 1 });
});

test("transpose, beats/measure, and add-segment stay behind Advanced options", async () => {
  login();
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1?mode=edit", path: "/recordings/:recordingId" });
  await screen.findByText("I");

  // Tempo and key are the exception: they are read above the player, so they are edited
  // there too — no Advanced options detour to correct a double-time count or a wrong key.
  expect(screen.getByRole("button", { name: /tempo:/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /key:/i })).toBeInTheDocument();

  expect(screen.queryByRole("button", { name: /\+1/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/beats \/ measure/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/bar-line shift/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /add segment/i })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /advanced options/i }));

  expect(screen.getByRole("button", { name: /\+1/ })).toBeInTheDocument();
  expect(screen.getByText(/beats \/ measure/i)).toBeInTheDocument();
  expect(screen.getByText(/bar-line shift/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /add segment/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /advanced options/i })); // collapses again
  expect(screen.queryByText(/beats \/ measure/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /add segment/i })).not.toBeInTheDocument();
});

test("beats/measure edits still reach the server from inside Advanced options", async () => {
  login();
  let patched: unknown = null;
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.patch("/api/charts/c1/settings", async ({ request }) => {
      patched = await request.json();
      return HttpResponse.json({ ...CHART, beats_per_measure: 3 });
    }),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1?mode=edit", path: "/recordings/:recordingId" });
  await screen.findByText("I");
  await userEvent.click(screen.getByRole("button", { name: /advanced options/i }));
  await userEvent.click(screen.getByRole("button", { name: "−" })); // 4 → 3 beats per measure
  await waitFor(() => expect(patched).toEqual({ beats_per_measure: 3 }));
});

test("the editor is positioned against the chart area, not the viewport", async () => {
  // It must anchor to the chord's row inside the chart (and scroll with it), so it has to
  // render inside the positioned .chart-area rather than as a page-level floating rail.
  login();
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1?mode=edit", path: "/recordings/:recordingId" });
  await userEvent.click(await screen.findByText("I"));

  const editor = (await screen.findByText("Edit segment")).closest(".segment-editor");
  expect(editor).not.toBeNull();
  expect(editor!.closest(".chart-area")).not.toBeNull();
  expect((editor as HTMLElement).style.top).not.toBe("");
});

test("clicking off the selected chord closes the editor, clicking another keeps it", async () => {
  login();
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1?mode=edit", path: "/recordings/:recordingId" });

  await userEvent.click(await screen.findByText("I"));
  expect(await screen.findByText("Edit segment")).toBeInTheDocument();

  // Another chord: the editor stays, now editing that chord.
  await userEvent.click(screen.getByText("IV"));
  expect(screen.getByText("Edit segment")).toBeInTheDocument();
  expect((screen.getByLabelText(/root/i) as HTMLSelectElement).value).toBe("F");

  // Off the chart entirely: the editor goes away.
  await userEvent.click(document.body);
  await waitFor(() => expect(screen.queryByText("Edit segment")).not.toBeInTheDocument());
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
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1?mode=edit", path: "/recordings/:recordingId" });
  await userEvent.click(await screen.findByText("I")); // select C on the timeline
  const beats = await screen.findByLabelText(/beats/i);
  fireEvent.change(beats, { target: { value: "6" } });
  await waitFor(() => expect(body).toEqual({ segments: [
    { id: "s1", start_beat: 0, end_beat: 6 },
    { id: "s2", start_beat: 6, end_beat: 8 },
  ] }));
});

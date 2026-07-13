import { screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import GuestHomePage from "./GuestHomePage";

// jsdom never loads media, so the real reader would hang: report "duration unknown".
vi.mock("../library/audioDuration", () => ({
  readAudioDuration: () => Promise.resolve(null),
}));

const RECORDING = {
  id: "g1",
  original_filename: "song.mp3",
  format: "mp3",
  duration_seconds: 4,
  status: "uploaded",
  created_at: "2026-07-12T00:00:00Z",
  analysis: {
    status: "done",
    bpm: 120,
    detected_key_tonic: "C",
    detected_key_mode: "major",
    engine_version: "template-v1",
    error: null,
    beat_times: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  },
};

const CHART = {
  id: "c1",
  recording_id: "g1",
  key_tonic: "C",
  key_mode: "major",
  beats_per_measure: 4,
  measure_offset: 0,
  beat_times: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  segments: [
    { id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2, chord_root: "C",
      chord_quality: "maj", roman_numeral: "I" },
    { id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4, chord_root: "G",
      chord_quality: "maj", roman_numeral: "V" },
  ],
};

function analysisSucceeds(uploads: string[] = []) {
  server.use(
    http.post("/api/recordings", async ({ request }) => {
      const form = await request.formData();
      uploads.push((form.get("file") as File).name);
      return HttpResponse.json(RECORDING, { status: 201 });
    }),
    http.get("/api/recordings/g1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/g1/chart", () => HttpResponse.json(CHART)),
  );
}

function drop(name = "song.mp3") {
  const zone = screen.getByRole("region", { name: /upload a recording/i });
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(["audio"], name, { type: "audio/mpeg" })] },
  });
}

test("a logged-out visitor is invited to upload, without being asked to log in", async () => {
  renderWithProviders(<GuestHomePage />);

  expect(await screen.findByText(/drag a song here/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /choose a file/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
});

test("dropping a song shows its chord sheet below the upload area, on the same page", async () => {
  analysisSucceeds();
  renderWithProviders(<GuestHomePage />);

  drop();

  // The chord cells, and the controls that edit them — the signed-in chord sheet, verbatim.
  expect(await screen.findByLabelText("Resize end of C")).toBeInTheDocument();
  expect(screen.getByLabelText("Resize end of G")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /add segment/i })).toBeInTheDocument();
  expect(screen.getByText(/120 BPM/)).toBeInTheDocument();
  // ...still on the upload page, not a separate route.
  expect(screen.getByRole("region", { name: /upload a recording/i })).toBeInTheDocument();
});

test("playback uses the local file, since the server deleted the upload after analysis", async () => {
  analysisSucceeds();
  const { container } = renderWithProviders(<GuestHomePage />);

  drop();

  await screen.findByLabelText("Resize end of C");
  const audio = container.querySelector("audio")!;
  expect(audio.getAttribute("src")).toMatch(/^blob:/);
  expect(audio.getAttribute("src")).not.toContain("/api/recordings");
});

test("re-analyzing re-sends the file the browser still holds", async () => {
  const uploads: string[] = [];
  analysisSucceeds(uploads);
  renderWithProviders(<GuestHomePage />);

  drop();
  await screen.findByLabelText("Resize end of C");
  fireEvent.click(screen.getByRole("button", { name: /re-analyze/i }));

  await waitFor(() => expect(uploads).toEqual(["song.mp3", "song.mp3"]));
});

test("the one-song-at-a-time limit is reported, not swallowed", async () => {
  server.use(
    http.post("/api/recordings", () =>
      HttpResponse.json(
        { detail: "Without an account you can analyze one song at a time." },
        { status: 409 },
      ),
    ),
  );
  renderWithProviders(<GuestHomePage />);

  drop();

  expect(await screen.findByRole("alert")).toHaveTextContent(/one song at a time/i);
});

test("signing up is offered as the way to keep the chart", async () => {
  renderWithProviders(<GuestHomePage />);

  const cta = await screen.findByRole("link", { name: /create an account/i });
  expect(cta).toHaveAttribute("href", "/register");
});

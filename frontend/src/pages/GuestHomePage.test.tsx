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
  bpm: 120,
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

/** Every guest upload mints a *new* recording id server-side (`app/guest.py`), and
 *  re-analyzing is a re-upload — so the id changes then too. The mock has to do the same, or
 *  it hides everything that keys off the id changing. */
function analysisSucceeds(uploads: string[] = []) {
  let n = 0;
  server.use(
    http.post("/api/recordings", async ({ request }) => {
      const form = await request.formData();
      uploads.push((form.get("file") as File).name);
      return HttpResponse.json({ ...RECORDING, id: `g${++n}` }, { status: 201 });
    }),
    http.get("/api/recordings/:id", ({ params }) =>
      HttpResponse.json({ ...RECORDING, id: params.id }),
    ),
    http.get("/api/recordings/:id/chart", ({ params }) =>
      HttpResponse.json({ ...CHART, recording_id: params.id }),
    ),
  );
}

function drop(name = "song.mp3") {
  const zone = screen.getByRole("region", { name: /upload a recording/i });
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(["audio"], name, { type: "audio/mpeg" })] },
  });
}

/** An uploaded song opens through the mode question — a guest is asked it just as a member
 *  is. Answer it, and the chord sheet appears. */
async function open(mode: "edit" | "practice" = "edit") {
  const name = mode === "edit" ? /open the chart/i : /practice mode/i;
  fireEvent.click(await screen.findByRole("button", { name }));
}

test("has no inline styles left", async () => {
  const { container } = renderWithProviders(<GuestHomePage />);
  await screen.findByText(/drag a song here/i);
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});

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
  await open();

  // The chord cells, and the controls that edit them — the signed-in chord sheet, verbatim.
  expect(await screen.findByLabelText("Resize end of C")).toBeInTheDocument();
  expect(screen.getByLabelText("Resize end of G")).toBeInTheDocument();
  expect(screen.getByText(/120 BPM/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /advanced options/i }));
  expect(screen.getByRole("button", { name: /add segment/i })).toBeInTheDocument();
  // ...still on the upload page, not a separate route.
  expect(screen.getByRole("region", { name: /upload a recording/i })).toBeInTheDocument();
});

test("playback uses the local file, since the server deleted the upload after analysis", async () => {
  analysisSucceeds();
  const { container } = renderWithProviders(<GuestHomePage />);

  drop();
  await open();

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
  await open();
  await screen.findByLabelText("Resize end of C");
  fireEvent.click(screen.getByRole("button", { name: /re-analyze/i }));

  await waitFor(() => expect(uploads).toEqual(["song.mp3", "song.mp3"]));
});

// Re-analyzing is a re-upload, so the recording id changes — but it is the same song, and the
// question of how to open it was answered before. Asking it again mid-edit throws the chart
// away and puts the chooser back in its place.
test("re-analyzing keeps you on the chart, without re-asking how to open the song", async () => {
  analysisSucceeds();
  renderWithProviders(<GuestHomePage />);

  drop();
  await open();
  await screen.findByLabelText("Resize end of C");
  fireEvent.click(screen.getByRole("button", { name: /re-analyze/i }));

  // The chart blanks while the re-analysis runs and is refetched under its new id, so wait
  // for it to come back rather than for the first frame after the click. Its coming back at
  // all is the proof: had the mode been reset, the chooser would be sitting there instead,
  // waiting for an answer nobody gives.
  await waitFor(() => expect(screen.getByLabelText("Resize end of C")).toBeInTheDocument(), {
    timeout: 5000,
  });
  expect(screen.queryByRole("heading", { name: /how do you want to open/i })).toBeNull();
}, 10000);

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

test("a chord edit saved after re-counting the tempo reaches the server, and the sheet shows it", async () => {
  // The guest's whole song lives in one page: re-count the tempo, then fix a chord. The
  // tempo response rescales every segment's beats, and that must not quietly reset the
  // chord dropdowns — a Save that PATCHes the old chord back looks like "nothing happened".
  const chart = structuredClone(CHART);
  const patched: unknown[] = [];
  server.use(
    http.post("/api/recordings", () => HttpResponse.json(RECORDING, { status: 201 })),
    http.get("/api/recordings/g1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/g1/chart", () => HttpResponse.json(chart)),
    http.patch("/api/charts/c1/tempo", () => {
      // Halving the tempo counts each chord as half as many beats; the chords don't move.
      chart.bpm = 60;
      chart.segments = chart.segments.map((s) => ({
        ...s,
        start_beat: s.start_beat / 2,
        end_beat: s.end_beat / 2,
      }));
      return HttpResponse.json(chart);
    }),
    http.patch("/api/charts/c1/segments/:sid", async ({ request, params }) => {
      const patch = (await request.json()) as Record<string, string>;
      patched.push(patch);
      const seg = chart.segments.find((s) => s.id === params.sid)!;
      Object.assign(seg, patch);
      return HttpResponse.json(seg);
    }),
  );
  renderWithProviders(<GuestHomePage />);
  drop();
  await open();
  await screen.findByLabelText("Resize end of C");

  fireEvent.click(screen.getByLabelText("Resize end of C").closest(".chord-cell")!);
  fireEvent.change(await screen.findByLabelText(/root/i), { target: { value: "A" } });
  fireEvent.change(screen.getByLabelText(/quality/i), { target: { value: "min7" } });

  // Re-count the tempo (click the BPM above the player to edit it; commits on blur), then
  // save the chord that is still on screen.
  fireEvent.click(screen.getByRole("button", { name: /tempo:/i }));
  fireEvent.change(screen.getByLabelText("Tempo"), { target: { value: "60" } });
  fireEvent.blur(screen.getByLabelText("Tempo"));
  await waitFor(() => expect(chart.bpm).toBe(60));
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

  await waitFor(() => expect(patched).toEqual([{ chord_root: "A", chord_quality: "min7" }]));
  expect(await screen.findByLabelText("Resize end of Amin7")).toBeInTheDocument();
});

test("signing up is offered as the way to keep the chart", async () => {
  renderWithProviders(<GuestHomePage />);

  const cta = await screen.findByRole("link", { name: /create an account/i });
  expect(cta).toHaveAttribute("href", "/register");
});

// The question is put to a guest as it is to a member — and under the shipped policy their
// answer is just as free. Locking it later is `practice/gate.ts`'s business, not this page's.
test("a guest is asked how to open the song, chart or practice", async () => {
  analysisSucceeds();
  renderWithProviders(<GuestHomePage />);

  drop();

  expect(await screen.findByRole("heading", { name: /how do you want to open/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /practice mode/i })).toBeEnabled();
  // The chords are not on the page until the question is answered.
  expect(screen.queryByText("C")).toBeNull();
});

test("a guest can practise: the chords are hidden until they name one", async () => {
  analysisSucceeds();
  const { container } = renderWithProviders(<GuestHomePage />);

  drop();
  await open("practice");

  await waitFor(() => expect(screen.getAllByText("?")).toHaveLength(2));
  expect(screen.queryByLabelText("Resize end of C")).toBeNull(); // read-only while practising

  // s1 is C major.
  fireEvent.click(screen.getAllByRole("button", { name: /hidden chord/i })[0]);
  fireEvent.change(await screen.findByLabelText("Root"), { target: { value: "C" } });
  fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "maj" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  // Read the chart, not the page: a bare getByText("C") also matches the "C" still sitting in
  // the Root dropdown, and would pass with nothing revealed at all.
  await waitFor(() => expect(screen.getAllByText("?")).toHaveLength(1));
  expect(container.querySelectorAll(".chord-cell strong")[0]).toHaveTextContent("C");
});

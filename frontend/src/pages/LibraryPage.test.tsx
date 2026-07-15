import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import LibraryPage from "./LibraryPage";

// jsdom never loads media, so the real reader would hang: report "duration unknown".
vi.mock("../library/audioDuration", () => ({
  readAudioDuration: () => Promise.resolve(null),
}));

function login() {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
}

function renderLibraryPage() {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json([])));
  return renderWithProviders(<LibraryPage />);
}

const TWO = [
  { id: "r1", original_filename: "Autumn Leaves.m4a", format: "m4a", duration_seconds: 30, status: "uploaded",
    created_at: "2026-06-01T00:00:00Z",
    analysis: { status: "done", bpm: 96, detected_key_tonic: "G", detected_key_mode: "major", engine_version: "v1", error: null } },
  { id: "r2", original_filename: "Blue in Green.m4a", format: "m4a", duration_seconds: 30, status: "uploaded",
    created_at: "2026-06-03T00:00:00Z",
    analysis: { status: "done", bpm: 80, detected_key_tonic: "C", detected_key_mode: "major", engine_version: "v1", error: null } },
];

test("lists recordings with their analysis status", async () => {
  login();
  server.use(
    http.get("/api/recordings", () =>
      HttpResponse.json([
        { id: "r1", original_filename: "song.m4a", format: "m4a", duration_seconds: 30, status: "uploaded",
          created_at: "2026-06-09T07:04:03Z",
          analysis: { status: "done", bpm: 96, detected_key_tonic: "G", detected_key_mode: "major", engine_version: "template-v1", error: null } },
      ]),
    ),
  );
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText("song.m4a")).toBeInTheDocument();
  expect(screen.getByText(/done/i)).toBeInTheDocument();
});

test("shows each recording's length in MM:SS", async () => {
  login();
  server.use(
    http.get("/api/recordings", () =>
      HttpResponse.json([{ ...TWO[0], duration_seconds: 195 }]),
    ),
  );
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText(/· 03:15/)).toBeInTheDocument();
});

test("lists the tempo and key the player set, not the ones the engine detected", async () => {
  login();
  server.use(
    http.get("/api/recordings", () =>
      HttpResponse.json([
        // The engine heard 144 BPM in C; the player re-counted it as 72 in A minor.
        { ...TWO[0], analysis: { ...TWO[0].analysis, bpm: 144, detected_key_tonic: "C", detected_key_mode: "major" },
          chart: { bpm: 72, key_tonic: "A", key_mode: "minor" } },
      ]),
    ),
  );
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText(/· 72 BPM · A minor/)).toBeInTheDocument();
  expect(screen.queryByText(/144 BPM/)).not.toBeInTheDocument();
});

test("shows an empty state when there are no recordings", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json([])));
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText(/no recordings yet/i)).toBeInTheDocument();
});

test("search narrows the visible recordings", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json(TWO)));
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText("Autumn Leaves.m4a")).toBeInTheDocument();

  await userEvent.type(screen.getByPlaceholderText(/search recordings/i), "blue");
  expect(screen.getByText("Blue in Green.m4a")).toBeInTheDocument();
  expect(screen.queryByText("Autumn Leaves.m4a")).not.toBeInTheDocument();
});

test("shows a no-match message when search excludes everything", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json(TWO)));
  renderWithProviders(<LibraryPage />);
  await screen.findByText("Autumn Leaves.m4a");
  await userEvent.type(screen.getByPlaceholderText(/search recordings/i), "zzz");
  expect(screen.getByText(/no recordings match/i)).toBeInTheDocument();
});

test("shows the server's message when an upload is rejected as too long", async () => {
  login();
  server.use(
    http.get("/api/recordings", () => HttpResponse.json([])),
    http.post("/api/recordings", () =>
      HttpResponse.json(
        { detail: "Recording is 12.5 minutes long; the maximum is 10 minutes." },
        { status: 413 },
      ),
    ),
  );
  const { container } = renderWithProviders(<LibraryPage />);
  await screen.findByText(/no recordings yet/i);

  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File([new Uint8Array([1, 2, 3])], "epic.m4a", { type: "audio/mp4" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Recording is 12.5 minutes long; the maximum is 10 minutes.",
  );
});

test("toggling sort reverses recording order", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json(TWO)));
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText("Blue in Green.m4a")).toBeInTheDocument();
  // default newest-first: Blue (06-03) before Autumn (06-01)
  const namesBefore = screen.getAllByText(/\.m4a$/).map((n) => n.textContent);
  expect(namesBefore[0]).toBe("Blue in Green.m4a");

  await userEvent.click(screen.getByRole("button", { name: /newest first/i }));
  const namesAfter = screen.getAllByText(/\.m4a$/).map((n) => n.textContent);
  expect(namesAfter[0]).toBe("Autumn Leaves.m4a");
});

test("has no inline styles left", async () => {
  const { container } = renderLibraryPage();
  await screen.findByText(/no recordings yet/i);
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});

test("renaming a recording PATCHes the new name to the server", async () => {
  login();
  let method: string | null = null;
  let body: unknown = null;
  server.use(
    http.get("/api/recordings", () => HttpResponse.json([TWO[0]])),
    http.patch("/api/recordings/:id", async ({ request, params }) => {
      method = request.method;
      body = await request.json();
      expect(params.id).toBe("r1");
      return HttpResponse.json({ ...TWO[0], original_filename: (body as { original_filename: string }).original_filename });
    }),
  );
  renderWithProviders(<LibraryPage />);
  await screen.findByText("Autumn Leaves.m4a");

  await userEvent.click(screen.getByRole("button", { name: /rename/i }));
  const input = screen.getByDisplayValue("Autumn Leaves.m4a");
  await userEvent.clear(input);
  await userEvent.type(input, "Autumn Leaves (remaster).m4a");
  await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

  await waitFor(() => expect(method).toBe("PATCH"));
  expect(body).toEqual({ original_filename: "Autumn Leaves (remaster).m4a" });
});

test("cancelling a rename does not call the API and restores the original name", async () => {
  login();
  const patchSpy = vi.fn();
  server.use(
    http.get("/api/recordings", () => HttpResponse.json([TWO[0]])),
    http.patch("/api/recordings/:id", async ({ request }) => {
      patchSpy(await request.json());
      return HttpResponse.json(TWO[0]);
    }),
  );
  renderWithProviders(<LibraryPage />);
  await screen.findByText("Autumn Leaves.m4a");

  await userEvent.click(screen.getByRole("button", { name: /rename/i }));
  const input = screen.getByDisplayValue("Autumn Leaves.m4a");
  await userEvent.clear(input);
  await userEvent.type(input, "Something else entirely.m4a");
  await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

  expect(screen.getByText("Autumn Leaves.m4a")).toBeInTheDocument();
  expect(screen.queryByText("Something else entirely.m4a")).not.toBeInTheDocument();
  expect(patchSpy).not.toHaveBeenCalled();
});

test("labels the search box for a screen reader", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json(TWO)));
  renderWithProviders(<LibraryPage />);
  await screen.findByText("Autumn Leaves.m4a");
  // A placeholder is not a reliable accessible name; a searchbox with no name announces as
  // "search, edit". aria-label gives it one.
  expect(screen.getByRole("searchbox", { name: /search recordings/i })).toBeInTheDocument();
});

test("labels the rename field with the recording it renames", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json([TWO[0]])));
  renderWithProviders(<LibraryPage />);
  await screen.findByText("Autumn Leaves.m4a");

  await userEvent.click(screen.getByRole("button", { name: /rename/i }));
  // The visible filename it replaces is gone once editing; the field must name itself.
  expect(screen.getByRole("textbox", { name: /rename autumn leaves/i })).toBeInTheDocument();
});

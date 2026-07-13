import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import LibraryPage from "./LibraryPage";

function login() {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
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

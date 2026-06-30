import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import LibraryPage from "./LibraryPage";

function login() {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
}

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

test("shows an empty state when there are no recordings", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json([])));
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText(/no recordings yet/i)).toBeInTheDocument();
});

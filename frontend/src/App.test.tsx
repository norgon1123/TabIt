import { screen } from "@testing-library/react";
import { vi } from "vitest";
import { renderWithProviders } from "./test/utils";
import App from "./App";

vi.mock("./library/audioDuration", () => ({ readAudioDuration: () => Promise.resolve(null) }));

test("logged-out user landing on / can try Tabit without an account", async () => {
  renderWithProviders(<App />, { route: "/" });

  // The front door is the upload area now, not a login wall.
  expect(await screen.findByRole("region", { name: /upload a recording/i })).toBeInTheDocument();
});

test("the saved-chart editor still requires an account", async () => {
  renderWithProviders(<App />, { route: "/recordings/r1" });

  expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Header from "./Header";

test("hides logout when logged out", async () => {
  renderWithProviders(<Header />);
  await waitFor(() => expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument());
});

test("shows logout when logged in and calls the endpoint", async () => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
  let loggedOut = false;
  server.use(
    http.post("/api/auth/logout", () => {
      loggedOut = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(<Header />);
  await userEvent.click(await screen.findByRole("button", { name: /log out/i }));
  await waitFor(() => expect(loggedOut).toBe(true));
});

// Header now renders ThemeToggle, which needs the ThemeProvider that
// renderWithProviders supplies.
test("offers the theme toggle", () => {
  renderWithProviders(<Header />);
  expect(screen.getByRole("button", { name: /switch to/i })).toBeInTheDocument();
});

test("has no inline styles left", () => {
  const { container } = renderWithProviders(<Header />);
  const styled = container.querySelectorAll("[style]");
  expect(
    Array.from(styled).map((e) => e.outerHTML.slice(0, 80)),
    "Header must carry no inline styles — they cannot respond to a theme",
  ).toEqual([]);
});

test("marks its nav as a landmark", () => {
  renderWithProviders(<Header />);
  expect(screen.getByRole("navigation")).toBeInTheDocument();
});

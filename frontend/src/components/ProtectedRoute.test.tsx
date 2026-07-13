import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import App from "../App";
import ProtectedRoute from "./ProtectedRoute";

test("redirects to /login when logged out", async () => {
  // "/" is open to guests now; a saved recording's chart is what still needs an account.
  renderWithProviders(<App />, { route: "/recordings/r1" });
  expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
});

test("renders children when logged in", async () => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
  renderWithProviders(
    <ProtectedRoute>
      <p>secret</p>
    </ProtectedRoute>,
    { route: "/", path: "/" },
  );
  expect(await screen.findByText("secret")).toBeInTheDocument();
});

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
